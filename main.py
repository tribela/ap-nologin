import base64
import hashlib
import hmac
import ipaddress
import os
import secrets
import tempfile
from urllib.parse import urlparse

import diskcache
import httpx
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="AP NoLogin", description="View ActivityPub notes without login")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# HMAC secret key for signing media URLs
# Use environment variable if set, otherwise generate a random secret
# Note: Random secret will change on each restart, invalidating previous signatures
media_secret = os.environ.get('MEDIA_HMAC_SECRET')
if not media_secret:
    media_secret = secrets.token_urlsafe(32)
MEDIA_HMAC_SECRET = media_secret.encode('utf-8')

# Disk-based cache configuration
CACHE_DIR = os.environ.get('CACHE_DIR', os.path.join(tempfile.gettempdir(), 'ap-nologin-cache'))
ACTIVITY_CACHE_TTL = int(os.environ.get('ACTIVITY_CACHE_TTL', 300))  # 5 minutes
MEDIA_CACHE_TTL = int(os.environ.get('MEDIA_CACHE_TTL', 3600))  # 1 hour
CACHE_SIZE_LIMIT = int(os.environ.get('CACHE_SIZE_LIMIT', 500 * 1024 * 1024))  # 500MB default

# Initialize disk cache
cache = diskcache.Cache(CACHE_DIR, size_limit=CACHE_SIZE_LIMIT)


def sign_media_url(url):
    """Generate HMAC signature for a media URL"""
    signature = hmac.new(MEDIA_HMAC_SECRET, url.encode('utf-8'), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(signature).decode('utf-8').rstrip('=')


def verify_media_signature(url, signature):
    """Verify HMAC signature for a media URL"""
    expected_signature = sign_media_url(url)
    return hmac.compare_digest(expected_signature, signature)


# ActivityPub type definitions
ACTIVITYPUB_TYPES = {
    'Person', 'Organization', 'Service', 'Group', 'Application',
    'Note', 'Article', 'Video', 'Audio', 'Image', 'Document',
    'Create', 'Update', 'Delete', 'Follow', 'Accept', 'Reject',
    'Like', 'Announce', 'Undo', 'Block', 'Add', 'Remove',
    'Question', 'Event', 'Place', 'Tombstone', 'OrderedCollection',
    'OrderedCollectionPage', 'Collection', 'CollectionPage'
}


def is_activitypub_content(content, content_type):
    """Validate if content is an ActivityPub object"""
    if not isinstance(content, (dict, list)):
        return False

    # If content-type explicitly says activity+json, trust it
    if "application/activity+json" in content_type.lower():
        return True

    if isinstance(content, dict):
        # Check for JSON-LD context
        if '@context' in content:
            return True

        # Check for ActivityPub type
        if 'type' in content:
            type_value = content.get('type')
            if isinstance(type_value, str):
                return type_value in ACTIVITYPUB_TYPES
            elif isinstance(type_value, list):
                return any(t in ACTIVITYPUB_TYPES for t in type_value if isinstance(t, str))

        # Objects with id might be ActivityPub (lenient check)
        if 'id' in content:
            return True

        return False

    elif isinstance(content, list):
        if len(content) == 0:
            return False
        # Check first item for ActivityPub indicators
        first_item = content[0]
        if isinstance(first_item, dict):
            return '@context' in first_item or 'type' in first_item
        return False

    return False


def extract_url_from_media_object(media_obj):
    """Extract URL from various media object formats"""
    if isinstance(media_obj, str):
        return media_obj
    if isinstance(media_obj, dict):
        url = media_obj.get('url') or media_obj.get('href')
        if isinstance(url, dict):
            return url.get('href')
        return url
    return None


def sign_media_urls_in_content(content):
    """Extract and sign media URLs from ActivityPub content"""
    signed_media = {}

    if not isinstance(content, dict):
        return signed_media

    # Sign top-level icon (for actor objects)
    icon = content.get('icon')
    if icon:
        icon_url = extract_url_from_media_object(icon)
        if isinstance(icon_url, str) and icon_url.startswith(('http://', 'https://')):
            signed_media[icon_url] = sign_media_url(icon_url)

    # Sign icon URLs from attributedTo
    if 'attributedTo' in content and isinstance(content['attributedTo'], dict):
        icon = content['attributedTo'].get('icon')
        if icon:
            icon_url = extract_url_from_media_object(icon)
            if isinstance(icon_url, str) and icon_url.startswith(('http://', 'https://')):
                signed_media[icon_url] = sign_media_url(icon_url)

        # Sign emoji URLs from attributedTo tags
        for tag in content['attributedTo'].get('tag', []):
            if isinstance(tag, dict) and tag.get('type') == 'Emoji':
                emoji_icon = tag.get('icon')
                if emoji_icon:
                    emoji_url = extract_url_from_media_object(emoji_icon)
                    if isinstance(emoji_url, str) and emoji_url.startswith(('http://', 'https://')):
                        signed_media[emoji_url] = sign_media_url(emoji_url)

    # Sign attachment URLs
    for att in content.get('attachment', []):
        att_url = extract_url_from_media_object(att)
        if isinstance(att_url, str) and att_url.startswith(('http://', 'https://')):
            signed_media[att_url] = sign_media_url(att_url)

    # Sign emoji URLs from tags
    for tag in content.get('tag', []):
        if isinstance(tag, dict) and tag.get('type') == 'Emoji':
            emoji_icon = tag.get('icon')
            if emoji_icon:
                emoji_url = extract_url_from_media_object(emoji_icon)
                if isinstance(emoji_url, str) and emoji_url.startswith(('http://', 'https://')):
                    signed_media[emoji_url] = sign_media_url(emoji_url)

    return signed_media


# API routes
@app.get("/api/health")
async def health():
    return JSONResponse(
        content={"status": "ok", "message": "Server is running"},
        headers={'Cache-Control': 'public, max-age=60'}
    )


@app.get("/api/activity")
async def process_url(url: str = Query(..., description="ActivityPub URL to fetch")):
    url = url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")

    # Check cache first
    cache_key = f"activity:{url}"
    cached = cache.get(cache_key)
    if cached is not None:
        content, final_url, content_type = cached
        # Sign media URLs (always fresh signatures)
        signed_media = sign_media_urls_in_content(content) if isinstance(content, dict) else {}

        result = {
            "success": True,
            "url": url,
            "final_url": final_url,
            "redirected": final_url != url,
            "content": content,
            "content_type": content_type,
            "status_code": 200
        }
        if signed_media:
            result["_signed_media"] = signed_media

        return JSONResponse(
            content=result,
            headers={'Cache-Control': 'public, max-age=300', 'X-Cache': 'HIT'}
        )

    headers = {
        "Accept": "application/activity+json"
    }

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        try:
            response = await client.get(url, headers=headers)

            # Check for HTTP error status codes
            if response.status_code >= 400:
                error_messages = {
                    401: "Unauthorized",
                    404: "Not Found",
                    410: "Gone",
                    403: "Forbidden",
                    500: "Internal Server Error",
                    502: "Bad Gateway",
                    503: "Service Unavailable",
                }
                error_msg = error_messages.get(
                    response.status_code,
                    f"HTTP {response.status_code} Error"
                )
                raise HTTPException(status_code=response.status_code, detail=error_msg)

            response.raise_for_status()

            # Get the final URL after redirects
            final_url = str(response.url)
            content_type = response.headers.get("content-type", "").lower()

            # Check if response is JSON
            is_json = (
                "application/activity+json" in content_type or
                "application/json" in content_type or
                "application/ld+json" in content_type
            )

            if not is_json:
                raise HTTPException(
                    status_code=400,
                    detail="URL does not appear to be an ActivityPub resource (not JSON)"
                )

            # Parse JSON content
            try:
                content = response.json()
            except Exception:
                raise HTTPException(
                    status_code=400,
                    detail="URL does not appear to be an ActivityPub resource (invalid JSON)"
                )

            # Validate ActivityPub content
            if not is_activitypub_content(content, content_type):
                raise HTTPException(
                    status_code=400,
                    detail="URL does not appear to be an ActivityPub resource"
                )

            # Store in cache (content, final_url, content_type)
            cache.set(cache_key, (content, final_url, content_type), expire=ACTIVITY_CACHE_TTL)

            # Sign media URLs
            signed_media = sign_media_urls_in_content(content) if isinstance(content, dict) else {}

            # Return the content with signed_media at top level
            result = {
                "success": True,
                "url": url,
                "final_url": final_url,
                "redirected": final_url != url,
                "content": content,
                "content_type": content_type,
                "status_code": response.status_code
            }
            if signed_media:
                result["_signed_media"] = signed_media

            return JSONResponse(
                content=result,
                headers={'Cache-Control': 'public, max-age=300', 'X-Cache': 'MISS'}
            )

        except httpx.HTTPStatusError as e:
            status_code = e.response.status_code
            error_messages = {
                401: "Unauthorized",
                404: "Not Found",
                410: "Gone",
                403: "Forbidden",
                500: "Internal Server Error",
                502: "Bad Gateway",
                503: "Service Unavailable",
            }
            error_msg = error_messages.get(
                status_code,
                f"HTTP {status_code} Error"
            )
            raise HTTPException(status_code=status_code, detail=error_msg)
        except httpx.HTTPError as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch URL: {str(e)}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")


@app.get("/api/webfinger")
async def webfinger(
    resource: str = Query(None, description="Webfinger resource (acct:user@domain)"),
    actor_url: str = Query(None, description="Direct actor URL")
):
    if not resource and not actor_url:
        raise HTTPException(status_code=400, detail="resource or actor_url is required")

    headers = {
        "Accept": "application/activity+json, application/jrd+json"
    }

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        try:
            # If actor_url is provided, fetch it directly
            if actor_url:
                response = await client.get(actor_url, headers=headers)
                response.raise_for_status()
                actor_data = response.json()

                # Extract domain from actor URL
                parsed = urlparse(actor_url)
                domain = parsed.netloc or ''

                # Extract icon URL
                icon = actor_data.get('icon')
                icon_url = extract_url_from_media_object(icon) if icon else None

                # Sign media URLs
                signed_media = sign_media_urls_in_content(actor_data)

                result = {
                    "success": True,
                    "handle": actor_data.get('preferredUsername', ''),
                    "nickname": actor_data.get('name', ''),
                    "id": actor_data.get('id', actor_url),
                    "domain": domain,
                    "tag": actor_data.get('tag', []),
                    "icon": icon_url
                }
                if signed_media:
                    result["_signed_media"] = signed_media
                return JSONResponse(
                    content=result,
                    headers={'Cache-Control': 'public, max-age=300'}
                )

            # Otherwise, try webfinger lookup
            if resource.startswith('acct:'):
                # Extract username and domain from acct:user@domain
                acct_parts = resource[5:].split('@')
                if len(acct_parts) != 2:
                    raise HTTPException(status_code=400, detail="Invalid acct format")
                username, domain = acct_parts
                webfinger_url = f"https://{domain}/.well-known/webfinger?resource={resource}"
            else:
                # Assume it's a URL, try to extract domain and do webfinger
                parsed = urlparse(resource)
                domain = parsed.netloc or resource
                webfinger_url = f"https://{domain}/.well-known/webfinger?resource=acct:{resource}"

            # Try webfinger first
            try:
                response = await client.get(webfinger_url, headers=headers)
                response.raise_for_status()
                webfinger_data = response.json()

                # Find the ActivityPub actor URL from webfinger links
                actor_url = None
                for link in webfinger_data.get('links', []):
                    if link.get('type') == 'application/activity+json':
                        actor_url = link.get('href')
                        break

                if not actor_url:
                    raise HTTPException(status_code=404, detail="No ActivityPub actor found")

                # Fetch the actor
                response = await client.get(actor_url, headers=headers)
                response.raise_for_status()
                actor_data = response.json()

                # Extract domain from actor URL
                parsed = urlparse(actor_url)
                domain = parsed.netloc or ''

                # Extract icon URL
                icon = actor_data.get('icon')
                icon_url = extract_url_from_media_object(icon) if icon else None

                # Sign media URLs
                signed_media = sign_media_urls_in_content(actor_data)

                result = {
                    "success": True,
                    "handle": actor_data.get('preferredUsername', ''),
                    "nickname": actor_data.get('name', ''),
                    "id": actor_data.get('id', actor_url),
                    "domain": domain,
                    "tag": actor_data.get('tag', []),
                    "icon": icon_url
                }
                if signed_media:
                    result["_signed_media"] = signed_media
                return JSONResponse(
                    content=result,
                    headers={'Cache-Control': 'public, max-age=300'}
                )

            except httpx.HTTPError:
                # If webfinger fails, try to use resource as direct actor URL
                if resource.startswith('http://') or resource.startswith('https://'):
                    response = await client.get(resource, headers=headers)
                    response.raise_for_status()
                    actor_data = response.json()

                    # Extract domain from resource URL
                    parsed = urlparse(resource)
                    domain = parsed.netloc or ''

                    # Extract icon URL
                    icon = actor_data.get('icon')
                    icon_url = extract_url_from_media_object(icon) if icon else None

                    # Sign media URLs
                    signed_media = sign_media_urls_in_content(actor_data)

                    result = {
                        "success": True,
                        "handle": actor_data.get('preferredUsername', ''),
                        "nickname": actor_data.get('name', ''),
                        "id": actor_data.get('id', resource),
                        "domain": domain,
                        "tag": actor_data.get('tag', []),
                        "icon": icon_url
                    }
                    if signed_media:
                        result["_signed_media"] = signed_media
                    return JSONResponse(content=result)
                raise

        except httpx.HTTPError as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch webfinger: {str(e)}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")


@app.get("/api/media")
async def proxy_media(
    url: str = Query(..., description="Media URL to proxy"),
    sig: str = Query(..., description="HMAC signature")
):
    media_url = url.strip()
    if not media_url:
        raise HTTPException(status_code=400, detail="URL parameter is required")

    # Verify HMAC signature - signature is required for security
    if not sig:
        raise HTTPException(status_code=403, detail="Signature is required")

    if not verify_media_signature(media_url, sig):
        raise HTTPException(status_code=403, detail="Invalid signature")

    # Validate URL format
    try:
        parsed = urlparse(media_url)
        # Only allow http and https protocols
        if parsed.scheme not in ('http', 'https'):
            raise HTTPException(status_code=400, detail="Only HTTP and HTTPS URLs are allowed")
        # Must have a valid hostname
        if not parsed.netloc:
            raise HTTPException(status_code=400, detail="Invalid URL format")
        # Prevent localhost/internal network access using ipaddress module
        hostname = parsed.hostname.lower()
        # Check if hostname is a blocked hostname
        blocked_hostnames = ('localhost', '0.0.0.0')
        if hostname in blocked_hostnames:
            raise HTTPException(status_code=403, detail="Local network access is not allowed")

        # Try to parse as IP address
        try:
            ip = ipaddress.ip_address(hostname)
            # Block private, loopback, link-local, and reserved addresses
            if (ip.is_private or ip.is_loopback or ip.is_link_local or
                    ip.is_reserved or ip.is_multicast):
                raise HTTPException(status_code=403, detail="Local network access is not allowed")
        except ValueError:
            # Not an IP address, check if it's a blocked hostname
            if hostname == 'localhost':
                raise HTTPException(status_code=403, detail="Local network access is not allowed")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid URL format")

    # Check cache first
    cache_key = f"media:{media_url}"
    cached = cache.get(cache_key)
    if cached is not None:
        content_bytes, content_type = cached
        return Response(
            content=content_bytes,
            media_type=content_type or "application/octet-stream",
            headers={'Cache-Control': 'public, max-age=3600', 'X-Cache': 'HIT'}
        )

    # Fetch media from external server
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True, max_redirects=5) as client:
        try:
            response = await client.get(media_url)
            response.raise_for_status()

            # Validate content type - only allow media types
            content_type = response.headers.get("content-type", "").lower()
            allowed_types = (
                "image/", "video/", "audio/",
                "application/octet-stream"  # Some servers don't set proper content-type
            )
            if not any(content_type.startswith(t) for t in allowed_types):
                # Still allow if content-type is missing (some servers don't set it)
                if content_type:
                    raise HTTPException(status_code=400, detail="Invalid content type")

            content_bytes = response.content

            # Store in cache (limit to 10MB per file to avoid huge files)
            if len(content_bytes) <= 10 * 1024 * 1024:
                cache.set(cache_key, (content_bytes, content_type), expire=MEDIA_CACHE_TTL)

            return Response(
                content=content_bytes,
                media_type=content_type or "application/octet-stream",
                headers={'Cache-Control': 'public, max-age=3600', 'X-Cache': 'MISS'}
            )

        except httpx.HTTPError as e:
            raise HTTPException(status_code=500, detail=f"Failed to fetch media: {str(e)}")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"An error occurred: {str(e)}")


# Mount static files
static_dir = "dist"
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

# Mount public directory for manifest.json and icons
public_dir = "public"
if os.path.exists(public_dir):
    app.mount("/public", StaticFiles(directory=public_dir), name="public")


# Serve manifest.json and icons from public directory
@app.get("/manifest.json")
async def serve_manifest():
    manifest_path = os.path.join(public_dir, "manifest.json")
    if os.path.exists(manifest_path):
        return FileResponse(manifest_path, media_type="application/manifest+json")
    raise HTTPException(status_code=404, detail="manifest.json not found")


@app.get("/icon-192.png")
async def serve_icon_192():
    icon_path = os.path.join(public_dir, "icon-192.png")
    if os.path.exists(icon_path):
        return FileResponse(icon_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="icon-192.png not found")


@app.get("/icon-512.png")
async def serve_icon_512():
    icon_path = os.path.join(public_dir, "icon-512.png")
    if os.path.exists(icon_path):
        return FileResponse(icon_path, media_type="image/png")
    raise HTTPException(status_code=404, detail="icon-512.png not found")


# Serve React app for all non-API routes
@app.get("/{path:path}")
async def serve(path: str, request: Request):
    # If it's an API route, let it pass through
    if path.startswith("api/"):
        raise HTTPException(status_code=404, detail="Not found")

    static_path = os.path.join(static_dir, path)
    # If the file exists, serve it
    if path and os.path.exists(static_path) and os.path.isfile(static_path):
        return FileResponse(static_path)
    # Otherwise serve index.html for SPA routing
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    raise HTTPException(status_code=404, detail="Not found")


if __name__ == "__main__":
    import uvicorn
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    uvicorn.run("main:app", host="0.0.0.0", port=5000, reload=debug)
