import React, { useState, useEffect } from 'react';
import './App.scss';
import { getMediaUrl, renderHtmlWithEmojis, renderNicknameWithEmojis } from './utils/emojiUtils';
import SearchIcon from './icons/SearchIcon.svg?react';
import LoadingIcon from './icons/LoadingIcon.svg?react';

// Helper function to extract quote URL from various field names
function getQuoteUrl(data) {
  if (!data || typeof data !== 'object') return null;
  // Try multiple possible field names
  return data.quoteUrl || data.quote || data.quoteUri || data._misskey_quote || null;
}

// Helper function to extract content from various field names (including Misskey)
function getContent(data) {
  if (!data || typeof data !== 'object') return null;
  // Try content, _misskey_content, or source.content
  const content = data.content || data._misskey_content || (data.source && data.source.content) || null;
  // Return content if it's a non-empty string
  return (typeof content === 'string' && content.trim()) ? content : null;
}

// Helper function to format date as YYYY-mm-DD HH:MM:SS
function formatDate(dateString) {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // Invalid date, return original

    // Format: YYYY-mm-DD HH:MM:SS
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return dateString; // Return original if formatting fails
  }
}

// UserHeader component for rendering user info (profile pic, nickname, handle, timestamp)
function UserHeader({ nickname, handle, fallback, tags, actorId, icon, published, postId, signedMedia = {} }) {
  const iconSignature = icon ? (signedMedia[icon] || null) : null;
  return (
    <div className="user-header">
      <div className="user-header-content">
        {icon && (
          <img
            src={getMediaUrl(icon, iconSignature)}
            alt="Profile"
            className="user-header-avatar"
            width="40"
            height="40"
          />
        )}
        <div className="user-header-info">
          <div style={{ fontSize: '0.9rem', wordBreak: 'break-word', overflowWrap: 'break-word' }}>
            {renderNicknameWithEmojis(nickname, tags, signedMedia)}
          </div>
          {handle && (
            <div style={{ fontSize: '0.85rem', opacity: 0.7, wordBreak: 'break-word' }}>
              {actorId ? (
                <a href={actorId} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>
                <span className="handle">{handle}</span>
              </a>
              ) : (
                <span className="handle">{handle}</span>
              )}
            </div>
          )}
          {!handle && !nickname && fallback && (
            <div style={{ fontSize: '0.85rem', opacity: 0.7, wordBreak: 'break-word' }}>
              <span>{fallback}</span>
            </div>
          )}
        </div>
      </div>
      {published && (
        <div className="user-header-date">
          {postId ? (
            <a href={postId} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>
              {formatDate(published)}
            </a>
          ) : (
            <span>{formatDate(published)}</span>
          )}
        </div>
      )}
    </div>
  );
}


// QuoteObject component for recursive rendering
function QuoteObject({ quoteUrl, depth = 0, maxDepth = 3 }) {
  const [quoteData, setQuoteData] = useState(null);
  const [quoteSignedMedia, setQuoteSignedMedia] = useState({});
  const [quoteActorInfo, setQuoteActorInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorStatus, setErrorStatus] = useState(null);
  const [showContent, setShowContent] = useState(false);
  const [showSensitiveMedia, setShowSensitiveMedia] = useState({});
  const [fullscreenMedia, setFullscreenMedia] = useState(null);

  useEffect(() => {
    if (!quoteUrl || depth >= maxDepth) {
      return;
    }

    const fetchQuote = async () => {
      setLoading(true);
      setErrorStatus(null);
      setQuoteData(null);
      setShowSensitiveMedia({});
      try {
        const response = await fetch(`/api/activity?url=${encodeURIComponent(quoteUrl)}`, {
          method: 'GET',
        });

        // Check for HTTP error status codes
        if (response.status >= 400) {
          const data = await response.json().catch(() => ({}));
          // FastAPI returns 'detail' field, but also check 'error' for compatibility
          setErrorStatus({
            code: response.status,
            message: data.detail || data.error || `HTTP ${response.status} Error`
          });
          return;
        }

        const data = await response.json();
        if (response.ok && typeof data.content === 'object' && data.content !== null) {
          setQuoteData(data.content);
          // Extract _signed_media from top level if present
          if (data._signed_media) {
            setQuoteSignedMedia(data._signed_media);
          } else {
            setQuoteSignedMedia({});
          }
        }
      } catch (err) {
        console.error('Failed to fetch quote:', err);
        setErrorStatus({
          code: 500,
          message: 'Failed to fetch quote'
        });
      } finally {
        setLoading(false);
      }
    };

    fetchQuote();
  }, [quoteUrl, depth, maxDepth]);

  useEffect(() => {
    if (!quoteData || !quoteData.attributedTo || depth >= maxDepth) {
      setQuoteActorInfo(null);
      return;
    }

    const fetchActorInfo = async () => {
      try {
        let actorUrl = null;
        if (typeof quoteData.attributedTo === 'string') {
          actorUrl = quoteData.attributedTo;
        } else if (typeof quoteData.attributedTo === 'object' && quoteData.attributedTo !== null) {
          actorUrl = quoteData.attributedTo.id;
        }

        if (!actorUrl || typeof actorUrl !== 'string') {
          setQuoteActorInfo(null);
          return;
        }

        const response = await fetch(`/api/webfinger?actor_url=${encodeURIComponent(actorUrl)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setQuoteActorInfo(data);
          } else {
            setQuoteActorInfo(null);
          }
        } else {
          setQuoteActorInfo(null);
        }
      } catch (err) {
        console.error('Failed to fetch quote actor info:', err);
        setQuoteActorInfo(null);
      }
    };

    fetchActorInfo();
  }, [quoteData, depth, maxDepth]);

  const parseAttributedTo = (data, actorInfo) => {
    if (actorInfo && (actorInfo.handle || actorInfo.nickname)) {
      const handle = actorInfo.handle || '';
      const domain = actorInfo.domain || '';
      const fullHandle = handle && domain ? `@${handle}@${domain}` : handle ? `@${handle}` : '';
      return {
        handle: fullHandle,
        nickname: actorInfo.nickname || null,
        fallback: null,
        tags: actorInfo.tag || [],
        actorId: actorInfo.id || null,
        icon: actorInfo.icon || null,
        signedMedia: actorInfo._signed_media || {}
      };
    }

    if (!data || !data.attributedTo) {
      return { handle: null, nickname: null, fallback: null, tags: [], actorId: null, icon: null };
    }

    if (typeof data.attributedTo === 'string') {
      return { handle: null, nickname: null, fallback: data.attributedTo, tags: [], actorId: data.attributedTo, icon: null };
    }

    if (typeof data.attributedTo === 'object' && data.attributedTo !== null) {
      const handle = data.attributedTo.preferredUsername || '';
      const nickname = data.attributedTo.name || null;
      const fallback = data.attributedTo.id || JSON.stringify(data.attributedTo);
      const tags = data.attributedTo.tag || [];
      const actorId = data.attributedTo.id || null;
      // Extract icon URL
      let iconUrl = null;
      const icon = data.attributedTo.icon;
      if (icon) {
        if (typeof icon === 'object' && icon.url) {
          iconUrl = icon.url;
        } else if (typeof icon === 'string') {
          iconUrl = icon;
        }
      }
      // Try to extract domain from id URL
      let domain = '';
      if (data.attributedTo.id) {
        try {
          const url = new URL(data.attributedTo.id);
          domain = url.hostname;
        } catch (e) {
          // Invalid URL, ignore
        }
      }
      const fullHandle = handle && domain ? `@${handle}@${domain}` : handle ? `@${handle}` : '';
      return { handle: fullHandle, nickname, fallback, tags, actorId, icon: iconUrl };
    }

    return { handle: null, nickname: null, fallback: null, tags: [], actorId: null, icon: null };
  };

  if (!quoteUrl) {
    return null;
  }

  // If max depth exceeded, show simple "quoted content" message
  if (depth >= maxDepth) {
    return (
      <div className="quote-object content-html" style={{ marginTop: '1rem', padding: '0.5rem' }}>
        <div style={{ fontStyle: 'italic', color: '#666' }}>quoted content</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="quote-object content-html" style={{ marginTop: '1rem', padding: '1rem' }}>
        <div>Loading quote...</div>
      </div>
    );
  }

  if (errorStatus) {
    const errorColors = {
      401: '#d32f2f',
      404: '#ed6c02',
      410: '#ed6c02',
      403: '#d32f2f',
      500: '#d32f2f',
    };
    const color = errorColors[errorStatus.code] || '#d32f2f';
    return (
      <div className="quote-object content-html" style={{ marginTop: '1rem', padding: '1rem' }}>
        <div style={{ color, fontWeight: 'bold' }}>
          {errorStatus.message} ({errorStatus.code})
        </div>
      </div>
    );
  }

  if (!quoteData) {
    return null;
  }

  const { handle, nickname, fallback, tags, actorId, icon, signedMedia: actorSignedMedia } = parseAttributedTo(quoteData, quoteActorInfo);

  const hasCW = !!quoteData.summary;
  const shouldShowContent = !hasCW || showContent;
  // Merge signed media from top level and actor info
  const signedMedia = { ...quoteSignedMedia, ...(actorSignedMedia || {}) };

  return (
    <>
    <div className="content-html" style={{ marginTop: '1rem', padding: '1rem' }}>
      {(quoteData.published || quoteData.attributedTo) && (
        <UserHeader
          nickname={nickname}
          handle={handle}
          fallback={fallback}
          tags={tags}
          actorId={actorId}
          icon={icon}
          published={quoteData.published}
          postId={quoteData.id}
          signedMedia={signedMedia}
        />
      )}
      {quoteData.summary && (
        <div style={{ marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', fontSize: '0.9rem' }}>
          <strong>Content Warning:</strong> {quoteData.summary}
          <button
            onClick={() => setShowContent(!showContent)}
            style={{
              marginLeft: '0.5rem',
              padding: '0.25rem 0.5rem',
              backgroundColor: '#fff',
              border: '1px solid #ffc107',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            {showContent ? 'Hide' : 'Show'}
          </button>
        </div>
      )}
      {shouldShowContent && getContent(quoteData) && (
        <div className="content-body">{renderHtmlWithEmojis(getContent(quoteData), quoteData.tag || [], signedMedia)}</div>
      )}
      {quoteData.attachment && Array.isArray(quoteData.attachment) && quoteData.attachment.length > 0 && (
        <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          {quoteData.attachment.map((att, idx) => {
            let url = null;
            if (typeof att === 'string') {
              url = att;
            } else if (att && typeof att === 'object') {
              // Handle nested URL structure
              if (typeof att.url === 'string') {
                url = att.url;
              } else if (att.url && typeof att.url === 'object' && att.url.href) {
                url = att.url.href;
              } else if (att.href) {
                url = att.href;
              }
            }
            const mediaType = att.mediaType || (att && att.type) || '';
            const name = (att && att.name) || (att && att.summary) || '';
            const isSensitive = att && typeof att === 'object' && (att.sensitive === true || att.sensitive === 'true');

            if (!url) return null;

            // Skip sensitive attachments if content is hidden (only if there's a CW or if showContent is false)
            if (isSensitive && !shouldShowContent) return null;

            const signature = signedMedia[url] || null;
            const mediaElement = (() => {
              if (mediaType.startsWith('image/')) {
                return (
                  <img
                    key={idx}
                    src={getMediaUrl(url, signature)}
                    alt={name}
                    onClick={() => setFullscreenMedia({ type: 'image', url, name, signature })}
                    style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px', objectFit: 'contain', cursor: 'pointer' }}
                  />
                );
              } else if (mediaType.startsWith('video/')) {
                return (
                  <video
                    key={idx}
                    src={getMediaUrl(url, signature)}
                    controls
                    onClick={() => setFullscreenMedia({ type: 'video', url, name, signature })}
                    style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px', cursor: 'pointer' }}
                  >
                    {name && <track kind="captions" />}
                  </video>
                );
              } else if (mediaType.startsWith('audio/')) {
                return (
                  <audio
                    key={idx}
                    src={getMediaUrl(url, signature)}
                    controls
                    style={{ width: '100%', maxWidth: '500px' }}
                  >
                    {name || 'Audio playback not supported'}
                  </audio>
                );
              } else {
                return (
                  <a
                    key={idx}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ display: 'block', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', textDecoration: 'none', color: '#0066cc' }}
                  >
                    {name || url}
                  </a>
                );
              }
            })();

            if (isSensitive) {
              const mediaKey = `sensitive-${idx}`;
              const isMediaShown = showSensitiveMedia[mediaKey] || false;
              return (
                <div key={idx} className="sensitive-media-container">
                  <div className={`sensitive-media-wrapper ${isMediaShown ? 'shown' : ''}`}>
                    {mediaElement}
                  </div>
                  {isMediaShown && (
                    <div
                      onClick={() => setShowSensitiveMedia({ ...showSensitiveMedia, [mediaKey]: false })}
                      className="sensitive-media-hide-button"
                      title="Hide sensitive content"
                    >
                      👁️
                    </div>
                  )}
                  <div
                    onClick={() => !isMediaShown && setShowSensitiveMedia({ ...showSensitiveMedia, [mediaKey]: true })}
                    className={`sensitive-media-overlay ${isMediaShown ? 'hidden' : ''}`}
                  >
                    <span className="sensitive-media-overlay-text">
                      press to show
                    </span>
                  </div>
                </div>
              );
            }

            return mediaElement;
          })}
        </div>
      )}
      {shouldShowContent && getQuoteUrl(quoteData) && (
        <QuoteObject quoteUrl={getQuoteUrl(quoteData)} depth={depth + 1} maxDepth={maxDepth} />
      )}
    </div>
    {fullscreenMedia && (
      <div
        onClick={() => setFullscreenMedia(null)}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          cursor: 'pointer'
        }}
      >
        {fullscreenMedia.type === 'image' ? (
          <img
            src={getMediaUrl(fullscreenMedia.url, fullscreenMedia.signature || null)}
            alt={fullscreenMedia.name || ''}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
          />
        ) : (
          <video
            src={getMediaUrl(fullscreenMedia.url, fullscreenMedia.signature || null)}
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh' }}
          >
            {fullscreenMedia.name && <track kind="captions" />}
          </video>
        )}
      </div>
    )}
    </>
  );
}

function App() {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [previewSignedMedia, setPreviewSignedMedia] = useState({});
  const [actorInfo, setActorInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRawJson, setShowRawJson] = useState(false);
  const [showContent, setShowContent] = useState(false);
  const [showSensitiveMedia, setShowSensitiveMedia] = useState({});
  const [fullscreenMedia, setFullscreenMedia] = useState(null);

  const handleRun = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    setLoading(true);
    setError('');
    setPreview('');
    setPreviewData(null);
    setPreviewSignedMedia({});
    setShowSensitiveMedia({});

    try {
      const response = await fetch(`/api/activity?url=${encodeURIComponent(url.trim())}`, {
        method: 'GET',
      });

      const data = await response.json();

      if (!response.ok) {
        // FastAPI returns 'detail' field, but also check 'error' for compatibility
        setError(data.detail || data.error || `HTTP ${response.status} Error`);
        return;
      }

      // Check if content is ActivityPub JSON
      let content = data.content;
      let displayPreview = '';

      // Add redirect info if redirected
      if (data.redirected && data.final_url) {
        displayPreview = `[Redirected from ${data.url} to ${data.final_url}]\n\n`;
      }

      if (typeof content === 'object' && content !== null) {
        setPreviewData(content);
        // Extract _signed_media from top level if present
        if (data._signed_media) {
          setPreviewSignedMedia(data._signed_media);
        } else {
          setPreviewSignedMedia({});
        }
        displayPreview += JSON.stringify(content, null, 2);
      } else {
        displayPreview += content || 'No content received';
        setPreviewSignedMedia({});
      }

      setPreview(displayPreview);
      setActorInfo(null);
    } catch (err) {
      setError('Failed to fetch preview');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleRun();
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const droppedText = e.dataTransfer.getData('text/plain');
    if (droppedText) {
      setUrl(droppedText.trim());
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && fullscreenMedia) {
        setFullscreenMedia(null);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [fullscreenMedia]);

  useEffect(() => {
    const fetchActorInfo = async () => {
      if (!previewData || !previewData.attributedTo) {
        setActorInfo(null);
        return;
      }

      try {
        let actorUrl = null;
        if (typeof previewData.attributedTo === 'string') {
          actorUrl = previewData.attributedTo;
        } else if (typeof previewData.attributedTo === 'object' && previewData.attributedTo !== null) {
          actorUrl = previewData.attributedTo.id;
        }

        if (!actorUrl || typeof actorUrl !== 'string') {
          setActorInfo(null);
          return;
        }

        const response = await fetch(`/api/webfinger?actor_url=${encodeURIComponent(actorUrl)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setActorInfo(data);
          } else {
            setActorInfo(null);
          }
        } else {
          setActorInfo(null);
        }
      } catch (err) {
        console.error('Failed to fetch actor info:', err);
        setActorInfo(null);
      }
    };

    fetchActorInfo();
  }, [previewData]);

  const parseAttributedTo = () => {
    // If we have actorInfo from webfinger, use it (preferred)
    if (actorInfo && (actorInfo.handle || actorInfo.nickname)) {
      const handle = actorInfo.handle || '';
      const domain = actorInfo.domain || '';
      const fullHandle = handle && domain ? `@${handle}@${domain}` : handle ? `@${handle}` : '';
      return {
        handle: fullHandle,
        nickname: actorInfo.nickname || null,
        fallback: null,
        tags: actorInfo.tag || [],
        actorId: actorInfo.id || null,
        icon: actorInfo.icon || null,
        signedMedia: actorInfo._signed_media || {}
      };
    }

    // Fallback to previewData
    if (!previewData || !previewData.attributedTo) {
      return { handle: null, nickname: null, fallback: null, tags: [], actorId: null, icon: null };
    }

    if (typeof previewData.attributedTo === 'string') {
      return { handle: null, nickname: null, fallback: previewData.attributedTo, tags: [], actorId: previewData.attributedTo, icon: null };
    }

    if (typeof previewData.attributedTo === 'object' && previewData.attributedTo !== null) {
      // Use data from previewData if available
      const handle = previewData.attributedTo.preferredUsername || '';
      const nickname = previewData.attributedTo.name || null;
      const fallback = previewData.attributedTo.id || JSON.stringify(previewData.attributedTo);
      const tags = previewData.attributedTo.tag || [];
      const actorId = previewData.attributedTo.id || null;
      // Extract icon URL
      let iconUrl = null;
      const icon = previewData.attributedTo.icon;
      if (icon) {
        if (typeof icon === 'object' && icon.url) {
          iconUrl = icon.url;
        } else if (typeof icon === 'string') {
          iconUrl = icon;
        }
      }
      // Try to extract domain from id URL
      let domain = '';
      if (previewData.attributedTo.id) {
        try {
          const url = new URL(previewData.attributedTo.id);
          domain = url.hostname;
        } catch (e) {
          // Invalid URL, ignore
        }
      }
      const fullHandle = handle && domain ? `@${handle}@${domain}` : handle ? `@${handle}` : '';
      return { handle: fullHandle, nickname, fallback, tags, actorId, icon: iconUrl };
    }

    return { handle: null, nickname: null, fallback: null, tags: [], actorId: null, icon: null };
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>AP NoLogin</h1>
      </header>

      <main className="App-main">
        <section className="input-section">
          <div className="input-group">
            <input
              type="url"
              className="url-input"
              placeholder="Enter URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyPress={handleKeyPress}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              disabled={loading}
            />
            <button
              className="run-button"
              onClick={handleRun}
              disabled={loading || !url.trim()}
              title={loading ? 'Loading...' : 'Show'}
            >
              {loading ? (
                <LoadingIcon />
              ) : (
                <SearchIcon />
              )}
            </button>
          </div>
          {error && <div className="error-message">{error}</div>}
        </section>

        {preview && (
          <section className="preview-section">
            {previewData && (
              <>
                {(getContent(previewData) || (previewData.attachment && previewData.attachment.length > 0)) && (
                  <div className="content-html">
                    {(previewData.published || previewData.attributedTo) && (() => {
                      const { handle, nickname, fallback, tags, actorId, icon, signedMedia: actorSignedMedia } = parseAttributedTo();
                      // Merge signed media from top level and actor info
                      const signedMedia = { ...previewSignedMedia, ...(actorSignedMedia || {}) };
                      return (
                        <UserHeader
                          nickname={nickname}
                          handle={handle}
                          fallback={fallback}
                          tags={tags}
                          actorId={actorId}
                          icon={icon}
                          published={previewData.published}
                          postId={previewData.id}
                          signedMedia={signedMedia}
                        />
                      );
                    })()}
                    {previewData.summary && (
                      <div style={{ marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', fontSize: '0.9rem' }}>
                        <strong>Content Warning:</strong> {previewData.summary}
                        <button
                          onClick={() => setShowContent(!showContent)}
                          style={{
                            marginLeft: '0.5rem',
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#fff',
                            border: '1px solid #ffc107',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.85rem'
                          }}
                        >
                          {showContent ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    )}
                    {(!previewData.summary || showContent) && getContent(previewData) && (
                      <div className="content-body">{renderHtmlWithEmojis(getContent(previewData), previewData.tag || [], previewSignedMedia)}</div>
                    )}
                    {previewData.attachment && Array.isArray(previewData.attachment) && previewData.attachment.length > 0 && (() => {
                      const shouldShowAttachments = !previewData.summary || showContent;
                      return (
                        <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                          {previewData.attachment.map((att, idx) => {
                            let url = null;
                            if (typeof att === 'string') {
                              url = att;
                            } else if (att && typeof att === 'object') {
                              // Handle nested URL structure
                              if (typeof att.url === 'string') {
                                url = att.url;
                              } else if (att.url && typeof att.url === 'object' && att.url.href) {
                                url = att.url.href;
                              } else if (att.href) {
                                url = att.href;
                              }
                            }
                            const mediaType = att.mediaType || (att && att.type) || '';
                            const name = (att && att.name) || (att && att.summary) || '';
                            const isSensitive = att && typeof att === 'object' && (att.sensitive === true || att.sensitive === 'true');
                            if (!url) return null;

                            // Skip sensitive attachments if content is hidden
                            if (isSensitive && !shouldShowAttachments) return null;

                            const signature = previewSignedMedia[url] || null;
                            const mediaElement = (() => {
                              if (mediaType.startsWith('image/')) {
                                return (
                                  <img
                                    key={idx}
                                    src={getMediaUrl(url, signature)}
                                    alt={name}
                                    onClick={() => setFullscreenMedia({ type: 'image', url, name, signature })}
                                    style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px', objectFit: 'contain', cursor: 'pointer' }}
                                  />
                                );
                              } else if (mediaType.startsWith('video/')) {
                                return (
                                  <video
                                    key={idx}
                                    src={getMediaUrl(url, signature)}
                                    controls
                                    onClick={() => setFullscreenMedia({ type: 'video', url, name, signature })}
                                    style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px', cursor: 'pointer' }}
                                  >
                                    {name && <track kind="captions" />}
                                  </video>
                                );
                              } else if (mediaType.startsWith('audio/')) {
                                return (
                                  <audio
                                    key={idx}
                                    src={getMediaUrl(url, signature)}
                                    controls
                                    style={{ width: '100%', maxWidth: '500px' }}
                                  >
                                    {name || 'Audio playback not supported'}
                                  </audio>
                                );
                              } else {
                                return (
                                  <a
                                    key={idx}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{ display: 'block', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', textDecoration: 'none', color: '#0066cc' }}
                                  >
                                    {name || url}
                                  </a>
                                );
                              }
                            })();

                            if (isSensitive) {
                              const mediaKey = `sensitive-${idx}`;
                              const isMediaShown = showSensitiveMedia[mediaKey] || false;
                              return (
                                <div key={idx} className="sensitive-media-container">
                                  <div className={`sensitive-media-wrapper ${isMediaShown ? 'shown' : ''}`}>
                                    {mediaElement}
                                  </div>
                                  {isMediaShown && (
                                    <div
                                      onClick={() => setShowSensitiveMedia({ ...showSensitiveMedia, [mediaKey]: false })}
                                      className="sensitive-media-hide-button"
                                      title="Hide sensitive content"
                                    >
                                      👁️
                                    </div>
                                  )}
                                  <div
                                    onClick={() => !isMediaShown && setShowSensitiveMedia({ ...showSensitiveMedia, [mediaKey]: true })}
                                    className={`sensitive-media-overlay ${isMediaShown ? 'hidden' : ''}`}
                                  >
                                    <span className="sensitive-media-overlay-text">
                                      press to show
                                    </span>
                                  </div>
                                </div>
                              );
                            }

                            return mediaElement;
                          })}
                        </div>
                      );
                    })()}
                    {(!previewData.summary || showContent) && getQuoteUrl(previewData) && (
                      <QuoteObject quoteUrl={getQuoteUrl(previewData)} depth={0} maxDepth={3} />
                    )}
                  </div>
                )}
                {!getContent(previewData) && getQuoteUrl(previewData) && (
                  <div className="content-html">
                    {previewData.summary && (
                      <div style={{ marginBottom: '0.5rem', padding: '0.5rem', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px', fontSize: '0.9rem' }}>
                        <strong>Content Warning:</strong> {previewData.summary}
                        <button
                          onClick={() => setShowContent(!showContent)}
                          style={{
                            marginLeft: '0.5rem',
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#fff',
                            border: '1px solid #ffc107',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            fontSize: '0.85rem'
                          }}
                        >
                          {showContent ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    )}
                    {(!previewData.summary || showContent) && (
                      <QuoteObject quoteUrl={getQuoteUrl(previewData)} depth={0} maxDepth={3} />
                    )}
                  </div>
                )}
              </>
            )}
            <div style={{ marginTop: '1rem' }}>
              <button
                className="raw-json-button"
                onClick={() => setShowRawJson(!showRawJson)}
              >
                {showRawJson ? 'Hide' : 'Show'} Raw JSON
              </button>
              {showRawJson && (
                <div className="preview-content" style={{ marginTop: '0.5rem' }}>
                  <pre>{preview}</pre>
                </div>
              )}
            </div>
          </section>
        )}
      </main>
      {fullscreenMedia && (
        <div
          onClick={() => setFullscreenMedia(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.9)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            cursor: 'pointer'
          }}
        >
          {fullscreenMedia.type === 'image' ? (
            <img
              src={getMediaUrl(fullscreenMedia.url, fullscreenMedia.signature || null)}
              alt={fullscreenMedia.name || ''}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
            />
          ) : (
            <video
              src={getMediaUrl(fullscreenMedia.url, fullscreenMedia.signature || null)}
              controls
              autoPlay
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '90vw', maxHeight: '90vh' }}
            >
              {fullscreenMedia.name && <track kind="captions" />}
            </video>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
