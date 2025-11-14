import os

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
    except httpx.HTTPError as e:
        return jsonify({"error": f"Failed to fetch URL: {str(e)}"}), 500
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
