import os
from urllib.parse import urlparse

import httpx
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='dist', static_url_path='')
CORS(app)


# API routes
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "message": "Server is running"})


@app.route("/api/process", methods=["POST"])
def process_url():
    try:
        data = request.get_json()
        url = data.get('url', '').strip()

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

            # Try to parse as JSON if content-type matches
            content_type = response.headers.get("content-type", "").lower()
            is_json = (
                "application/activity+json" in content_type or
                "application/json" in content_type
            )
            if is_json:
                try:
                    content = response.json()
                except Exception:
                    content = response.text
            else:
                content = response.text

            # Return the content
            return jsonify({
                "success": True,
                "url": url,
                "final_url": final_url,
                "redirected": final_url != url,
                "content": content,
                "content_type": content_type,
                "status_code": response.status_code
            })
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
                icon_url = None
                icon = actor_data.get('icon')
                if isinstance(icon, dict):
                    icon_url = icon.get('url')
                elif isinstance(icon, str):
                    icon_url = icon
                return jsonify({
                    "success": True,
                    "handle": actor_data.get('preferredUsername', ''),
                    "nickname": actor_data.get('name', ''),
                    "id": actor_data.get('id', actor_url),
                    "domain": domain,
                    "tag": actor_data.get('tag', []),
                    "icon": icon_url
                })

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
                icon_url = None
                icon = actor_data.get('icon')
                if isinstance(icon, dict):
                    icon_url = icon.get('url')
                elif isinstance(icon, str):
                    icon_url = icon
                return jsonify({
                    "success": True,
                    "handle": actor_data.get('preferredUsername', ''),
                    "nickname": actor_data.get('name', ''),
                    "id": actor_data.get('id', actor_url),
                    "domain": domain,
                    "tag": actor_data.get('tag', []),
                    "icon": icon_url
                })
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
                    icon_url = None
                    icon = actor_data.get('icon')
                    if isinstance(icon, dict):
                        icon_url = icon.get('url')
                    elif isinstance(icon, str):
                        icon_url = icon

                    return jsonify({
                        "success": True,
                        "handle": actor_data.get('preferredUsername', ''),
                        "nickname": actor_data.get('name', ''),
                        "id": actor_data.get('id', resource),
                        "domain": domain,
                        "tag": actor_data.get('tag', []),
                        "icon": icon_url
                    })
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
    app.run(debug=True, use_reloader=True, host="0.0.0.0", port=5000)


if __name__ == "__main__":
    main()
