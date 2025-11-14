import React from 'react';

// Helper function to proxy media URLs through backend
// Note: HMAC signature should be generated server-side when processing ActivityPub objects
export function getMediaUrl(url, signature = null) {
  if (!url) return null;
  // If already a relative URL or data URL, return as is
  if (url.startsWith('/') || url.startsWith('data:')) {
    return url;
  }
  // Proxy through backend
  let proxyUrl = `/api/media?url=${encodeURIComponent(url)}`;
  if (signature) {
    proxyUrl += `&sig=${encodeURIComponent(signature)}`;
  }
  return proxyUrl;
}

// Helper function to create emoji map from tags
export function createEmojiMap(tags = []) {
  const emojiMap = {};
  if (Array.isArray(tags)) {
    tags.forEach((tag) => {
      if (tag.type === 'Emoji' && tag.name) {
        let emojiUrl = null;
        if (tag.icon) {
          if (typeof tag.icon === 'string') {
            emojiUrl = tag.icon;
          } else if (tag.icon.url) {
            emojiUrl = tag.icon.url;
          }
        }
        if (emojiUrl) {
          emojiMap[tag.name] = emojiUrl;
        }
      }
    });
  }
  return emojiMap;
}

// Function to parse HTML and render as React components with emoji support
export function renderHtmlWithEmojis(htmlContent, tags = [], signedMedia = {}) {
  if (!htmlContent || typeof htmlContent !== 'string') {
    return null;
  }

  const emojiMap = createEmojiMap(tags);
  const hasEmojis = Object.keys(emojiMap).length > 0;

  // Simple HTML parser that converts to React elements
  function parseHtmlToReact(html, keyPrefix = '') {
    if (!html) return null;

    // Use DOMParser if available (browser), otherwise fallback to simple parsing
    if (typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
        const container = doc.body.firstChild;

        function processNode(node, index = 0) {
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            if (!hasEmojis) {
              return text;
            }

            // Replace emojis in text nodes
            const parts = [];
            let lastIndex = 0;
            const emojiPattern = /:([a-zA-Z0-9_]+):/g;
            let match;
            let keyCounter = 0;

            while ((match = emojiPattern.exec(text)) !== null) {
              if (match.index > lastIndex) {
                parts.push(text.substring(lastIndex, match.index));
              }

              const emojiName = `:${match[1]}:`;
              if (emojiMap[emojiName]) {
                const emojiUrl = emojiMap[emojiName];
                const emojiSignature = signedMedia[emojiUrl] || null;
                parts.push(
                  <img
                    key={`${keyPrefix}-emoji-${keyCounter++}`}
                    src={getMediaUrl(emojiUrl, emojiSignature)}
                    alt={emojiName}
                    className="custom-emoji"
                  />
                );
              } else {
                parts.push(emojiName);
              }

              lastIndex = match.index + match[0].length;
            }

            if (lastIndex < text.length) {
              parts.push(text.substring(lastIndex));
            }

            return parts.length > 1 ? parts : (parts[0] || text);
          } else if (node.nodeType === Node.ELEMENT_NODE) {
            const tagName = node.tagName.toLowerCase();
            const props = { key: `${keyPrefix}-${tagName}-${index}` };

            // Copy attributes
            Array.from(node.attributes).forEach((attr) => {
              if (attr.name === 'style' && attr.value) {
                // Parse inline styles
                const styles = {};
                attr.value.split(';').forEach((style) => {
                  const [key, value] = style.split(':').map((s) => s.trim());
                  if (key && value) {
                    const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                    styles[camelKey] = value;
                  }
                });
                props.style = styles;
              } else if (attr.name === 'class') {
                props.className = attr.value;
              } else {
                props[attr.name] = attr.value;
              }
            });

            // Process children
            const children = Array.from(node.childNodes).map((child, childIndex) =>
              processNode(child, childIndex)
            ).filter((child) => child !== null);

            return React.createElement(tagName, props, ...children);
          }
          return null;
        }

        const children = Array.from(container.childNodes).map((child, index) =>
          processNode(child, index)
        ).filter((child) => child !== null);

        return children.length === 1 ? children[0] : <>{children}</>;
      } catch (e) {
        console.error('Error parsing HTML:', e);
        // Fallback to dangerouslySetInnerHTML if parsing fails
        return <div dangerouslySetInnerHTML={{ __html: htmlContent }} />;
      }
    } else {
      // Fallback for environments without DOMParser
      return <div dangerouslySetInnerHTML={{ __html: htmlContent }} />;
    }
  }

  return parseHtmlToReact(htmlContent);
}

// Function to render nickname with custom emojis
export function renderNicknameWithEmojis(nickname, tags = [], signedMedia = {}) {
  if (!nickname) {
    return null;
  }

  const emojiMap = createEmojiMap(tags);

  // If no emojis, return plain text
  if (Object.keys(emojiMap).length === 0) {
    return <span className="nickname">{nickname}</span>;
  }

  // Replace emoji patterns with images
  const parts = [];
  let lastIndex = 0;
  const emojiPattern = /:([a-zA-Z0-9_]+):/g;
  let match;

  while ((match = emojiPattern.exec(nickname)) !== null) {
    // Add text before the emoji
    if (match.index > lastIndex) {
      parts.push(nickname.substring(lastIndex, match.index));
    }

    const emojiName = `:${match[1]}:`;
    if (emojiMap[emojiName]) {
      const emojiUrl = emojiMap[emojiName];
      const emojiSignature = signedMedia[emojiUrl] || null;
      parts.push(
        <img
          key={match.index}
          src={getMediaUrl(emojiUrl, emojiSignature)}
          alt={emojiName}
          className="custom-emoji"
        />
      );
    } else {
      // Emoji not found, keep the text
      parts.push(emojiName);
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  if (lastIndex < nickname.length) {
    parts.push(nickname.substring(lastIndex));
  }

  return <span className="nickname">{parts.length > 0 ? parts : nickname}</span>;
}

