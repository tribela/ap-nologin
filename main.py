import base64
import hashlib
import hmac
import ipaddress
import os
import secrets
from urllib.parse import urlparse

import httpx
from asgiref.wsgi import WsgiToAsgi
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='dist', static_url_path='')
CORS(app)

# HMAC secret key for signing media URLs
# Use environment variable if set, otherwise generate a random secret
# Note: Random secret will change on each restart, invalidating previous signatures
media_secret = os.environ.get('MEDIA_HMAC_SECRET')
if not media_secret:
    media_secret = secrets.token_urlsafe(32)
MEDIA_HMAC_SECRET = media_secret.encode('utf-8')


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
@app.route("/api/health", methods=["GET"])
def health():
    response = jsonify({"status": "ok", "message": "Server is running"})
    response.headers['Cache-Control'] = 'public, max-age=60'  # Cache for 1 minute
    return response


@app.route("/api/activity", methods=["GET"])
def process_url():
    try:
        url = request.args.get('url', '').strip()

        if not url:
            return jsonify({"error": "URL is required"}), 400

        # Fetch URL content using httpx with application/activity+json
        headers = {
            "Accept": "application/activity+json"
        }
        with httpx.Client(timeout=10.0, follow_redirects=True) as client:
            response = client.get(url, headers=headers)

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
                return jsonify({"error": error_msg}), response.status_code

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
                return jsonify({"error": "URL does not appear to be an ActivityPub resource (not JSON)"}), 400

            # Parse JSON content
            try:
                content = response.json()
            except Exception:
                return jsonify({"error": "URL does not appear to be an ActivityPub resource (invalid JSON)"}), 400

            # Validate ActivityPub content
            if not is_activitypub_content(content, content_type):
                return jsonify({"error": "URL does not appear to be an ActivityPub resource"}), 400

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

            # Add cache headers for reverse proxy caching
            response_obj = jsonify(result)
            response_obj.headers['Cache-Control'] = 'public, max-age=300'  # Cache for 5 minutes
            return response_obj
    except httpx.HTTPStatusError as e:
        # Handle HTTP status errors that weren't caught above
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
        return jsonify({"error": error_msg}), status_code
    except httpx.HTTPError as e:
        return jsonify({"error": f"Failed to fetch URL: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500


@app.route("/api/webfinger", methods=["GET"])
def webfinger():
    try:
        resource = request.args.get('resource', '').strip()
        actor_url = request.args.get('actor_url', '').strip()

        if not resource and not actor_url:
            return jsonify({"error": "resource or actor_url is required"}), 400

        headers = {
            "Accept": "application/activity+json, application/jrd+json"
        }

        with httpx.Client(timeout=10.0, follow_redirects=True) as client:
            # If actor_url is provided, fetch it directly
            if actor_url:
                response = client.get(actor_url, headers=headers)
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
                response = jsonify(result)
                response.headers['Cache-Control'] = 'public, max-age=300'  # Cache for 5 minutes
                return response

            # Otherwise, try webfinger lookup
            if resource.startswith('acct:'):
                # Extract username and domain from acct:user@domain
                acct_parts = resource[5:].split('@')
                if len(acct_parts) != 2:
                    return jsonify({"error": "Invalid acct format"}), 400
                username, domain = acct_parts
                webfinger_url = f"https://{domain}/.well-known/webfinger?resource={resource}"
            else:
                # Assume it's a URL, try to extract domain and do webfinger
                parsed = urlparse(resource)
                domain = parsed.netloc or resource
                webfinger_url = f"https://{domain}/.well-known/webfinger?resource=acct:{resource}"

            # Try webfinger first
            try:
                response = client.get(webfinger_url, headers=headers)
                response.raise_for_status()
                webfinger_data = response.json()

                # Find the ActivityPub actor URL from webfinger links
                actor_url = None
                for link in webfinger_data.get('links', []):
                    if link.get('type') == 'application/activity+json':
                        actor_url = link.get('href')
                        break

                if not actor_url:
                    return jsonify({"error": "No ActivityPub actor found"}), 404

                # Fetch the actor
                response = client.get(actor_url, headers=headers)
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
                response = jsonify(result)
                response.headers['Cache-Control'] = 'public, max-age=300'  # Cache for 5 minutes
                return response
            except httpx.HTTPError:
                # If webfinger fails, try to use resource as direct actor URL
                if resource.startswith('http://') or resource.startswith('https://'):
                    response = client.get(resource, headers=headers)
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
                    return jsonify(result)
                raise

    except httpx.HTTPError as e:
        return jsonify({"error": f"Failed to fetch webfinger: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500


# Serve React app for all non-API routes
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    if path != "" and os.path.exists(app.static_folder + '/' + path):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')


def main():
    print("Starting Flask server...")
    print(f"Serving React app from: {app.static_folder}")
    debug = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true'
    app.run(debug=debug, use_reloader=debug, host="0.0.0.0", port=5000)


@app.route("/api/media", methods=["GET"])
def proxy_media():
    try:
        media_url = request.args.get('url', '').strip()
        if not media_url:
            return jsonify({"error": "URL parameter is required"}), 400

        # Verify HMAC signature - signature is required for security
        signature = request.args.get('sig', '')
        if not signature:
            return jsonify({"error": "Signature is required"}), 403

        if not verify_media_signature(media_url, signature):
            return jsonify({"error": "Invalid signature"}), 403

        # Validate URL format
        try:
            parsed = urlparse(media_url)
            # Only allow http and https protocols
            if parsed.scheme not in ('http', 'https'):
                return jsonify({"error": "Only HTTP and HTTPS URLs are allowed"}), 400
            # Must have a valid hostname
            if not parsed.netloc:
                return jsonify({"error": "Invalid URL format"}), 400
            # Prevent localhost/internal network access using ipaddress module
            hostname = parsed.hostname.lower()
            # Check if hostname is a blocked hostname
            blocked_hostnames = ('localhost', '0.0.0.0')
            if hostname in blocked_hostnames:
                return jsonify({"error": "Local network access is not allowed"}), 403

            # Try to parse as IP address
            try:
                ip = ipaddress.ip_address(hostname)
                # Block private, loopback, link-local, and reserved addresses
                if (ip.is_private or ip.is_loopback or ip.is_link_local or
                        ip.is_reserved or ip.is_multicast):
                    return jsonify({"error": "Local network access is not allowed"}), 403
            except ValueError:
                # Not an IP address, check if it's a blocked hostname
                if hostname == 'localhost':
                    return jsonify({"error": "Local network access is not allowed"}), 403
        except Exception:
            return jsonify({"error": "Invalid URL format"}), 400

        with httpx.Client(timeout=30.0, follow_redirects=True) as client:
            response = client.get(media_url)
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
                    return jsonify({"error": "Invalid content type"}), 400

            # Return the media with appropriate content type and cache headers
            headers = {
                "Content-Type": content_type or "application/octet-stream",
                "Cache-Control": "public, max-age=3600"  # Cache for 1 hour
            }
            return response.content, 200, headers

    except httpx.HTTPError as e:
        return jsonify({"error": f"Failed to fetch media: {str(e)}"}), 500
    except Exception as e:
        return jsonify({"error": f"An error occurred: {str(e)}"}), 500


# Wrap Flask app as ASGI for uvicorn
asgi_app = WsgiToAsgi(app)


if __name__ == "__main__":
    main()
