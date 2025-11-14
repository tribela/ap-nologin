import React, { useState, useEffect } from 'react';
import './App.css';

// Helper function to proxy media URLs through backend
function getMediaUrl(url) {
  if (!url) return null;
  // If already a relative URL or data URL, return as is
  if (url.startsWith('/') || url.startsWith('data:')) {
    return url;
  }
  // Proxy through backend
  return `/api/media?url=${encodeURIComponent(url)}`;
}

// UserHeader component for rendering user info (profile pic, nickname, handle, timestamp)
function UserHeader({ nickname, handle, fallback, tags, actorId, icon, published, postId }) {
  return (
    <div style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem', justifyContent: 'space-between', alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', gap: '0.5rem', flex: 1 }}>
        {icon && (
          <img src={getMediaUrl(icon)} alt="Profile" style={{ width: '2.5em', height: '2.5em', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ fontSize: '0.9rem' }}>
            {renderNicknameWithEmojis(nickname, tags)}
          </div>
          {handle && (
            <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
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
            <div style={{ fontSize: '0.85rem', opacity: 0.7 }}>
              <span>{fallback}</span>
            </div>
          )}
        </div>
      </div>
      {published && (
        <div style={{ fontSize: '0.85rem', opacity: 0.7, flexShrink: 0 }}>
          {postId ? (
            <a href={postId} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>
              {new Date(published).toISOString()}
            </a>
          ) : (
            <span>{new Date(published).toISOString()}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Function to render nickname with custom emojis
function renderNicknameWithEmojis(nickname, tags = []) {
  if (!nickname) {
    return null;
  }

  // Create a map of emoji names to URLs
  const emojiMap = {};
  if (Array.isArray(tags)) {
    tags.forEach((tag) => {
      if (tag.type === 'Emoji' && tag.name && tag.icon && tag.icon.url) {
        emojiMap[tag.name] = tag.icon.url;
      }
    });
  }

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
      parts.push(
        <img
          key={match.index}
          src={getMediaUrl(emojiMap[emojiName])}
          alt={emojiName}
          style={{ width: '1em', height: '1em', verticalAlign: 'middle', margin: '0 0.1em' }}
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

// QuoteObject component for recursive rendering
function QuoteObject({ quoteUrl, depth = 0, maxDepth = 3 }) {
  const [quoteData, setQuoteData] = useState(null);
  const [quoteActorInfo, setQuoteActorInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [errorStatus, setErrorStatus] = useState(null);
  const [showContent, setShowContent] = useState(false);
  const [fullscreenMedia, setFullscreenMedia] = useState(null);

  useEffect(() => {
    if (!quoteUrl || depth >= maxDepth) {
      return;
    }

    const fetchQuote = async () => {
      setLoading(true);
      setErrorStatus(null);
      setQuoteData(null);
      try {
        const response = await fetch('/api/process', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url: quoteUrl }),
        });

        // Check for HTTP error status codes
        if (response.status >= 400) {
          const data = await response.json().catch(() => ({}));
          setErrorStatus({
            code: response.status,
            message: data.error || `HTTP ${response.status} Error`
          });
          return;
        }

        const data = await response.json();
        if (response.ok && typeof data.content === 'object' && data.content !== null) {
          setQuoteData(data.content);
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
        icon: actorInfo.icon || null
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
      <div className="quote-object" style={{ marginTop: '1rem', padding: '0.5rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#fefefe' }}>
        <div style={{ fontStyle: 'italic', color: '#666' }}>quoted content</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="quote-object" style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px' }}>
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
      <div className="quote-object" style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#fefefe' }}>
        <div style={{ color, fontWeight: 'bold' }}>
          {errorStatus.message} ({errorStatus.code})
        </div>
      </div>
    );
  }

  if (!quoteData) {
    return null;
  }

  const { handle, nickname, fallback, tags, actorId, icon } = parseAttributedTo(quoteData, quoteActorInfo);

  const hasCW = !!quoteData.summary;
  const shouldShowContent = !hasCW || showContent;

  return (
    <>
    <div className="content-html" style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#fefefe' }}>
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
      {shouldShowContent && quoteData.content && (
        <div dangerouslySetInnerHTML={{ __html: quoteData.content }} />
      )}
      {shouldShowContent && quoteData.attachment && Array.isArray(quoteData.attachment) && quoteData.attachment.length > 0 && (
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
            
            if (!url) return null;
            
            if (mediaType.startsWith('image/')) {
              return (
                <img
                  key={idx}
                  src={getMediaUrl(url)}
                  alt={name}
                  onClick={() => setFullscreenMedia({ type: 'image', url, name })}
                  style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px', objectFit: 'contain', cursor: 'pointer' }}
                />
              );
            } else if (mediaType.startsWith('video/')) {
              return (
                <video
                  key={idx}
                  src={getMediaUrl(url)}
                  controls
                  onClick={() => setFullscreenMedia({ type: 'video', url, name })}
                  style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px', cursor: 'pointer' }}
                >
                  {name && <track kind="captions" />}
                </video>
              );
            } else if (mediaType.startsWith('audio/')) {
              return (
                <audio
                  key={idx}
                  src={getMediaUrl(url)}
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
          })}
        </div>
      )}
      {shouldShowContent && quoteData.quoteUrl && (
        <QuoteObject quoteUrl={quoteData.quoteUrl} depth={depth + 1} maxDepth={maxDepth} />
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
            src={getMediaUrl(fullscreenMedia.url)}
            alt={fullscreenMedia.name || ''}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
          />
        ) : (
          <video
            src={getMediaUrl(fullscreenMedia.url)}
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
  const [actorInfo, setActorInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showRawJson, setShowRawJson] = useState(false);
  const [showContent, setShowContent] = useState(false);
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

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to process URL');
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
        displayPreview += JSON.stringify(content, null, 2);
      } else {
        displayPreview += content || 'No content received';
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
        icon: actorInfo.icon || null
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
        <h1>MSK NoLogin</h1>
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
              disabled={loading}
            />
            <button
              className="run-button"
              onClick={handleRun}
              disabled={loading || !url.trim()}
            >
              {loading ? 'Loading...' : 'Show'}
            </button>
          </div>
          {error && <div className="error-message">{error}</div>}
        </section>

        {preview && (
          <section className="preview-section">
            {previewData && (
              <>
                {previewData.content && (
                  <div className="content-html">
                    {(previewData.published || previewData.attributedTo) && (() => {
                      const { handle, nickname, fallback, tags, actorId, icon } = parseAttributedTo();
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
                    {(!previewData.summary || showContent) && previewData.content && (
                      <div dangerouslySetInnerHTML={{ __html: previewData.content }} />
                    )}
                    {(!previewData.summary || showContent) && previewData.attachment && Array.isArray(previewData.attachment) && previewData.attachment.length > 0 && (
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
                          
                          if (!url) return null;
                          
                          if (mediaType.startsWith('image/')) {
                            return (
                              <img
                                key={idx}
                                src={getMediaUrl(url)}
                                alt={name}
                                onClick={() => setFullscreenMedia({ type: 'image', url, name })}
                                style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px', objectFit: 'contain', cursor: 'pointer' }}
                              />
                            );
                          } else if (mediaType.startsWith('video/')) {
                            return (
                              <video
                                key={idx}
                                src={getMediaUrl(url)}
                                controls
                                onClick={() => setFullscreenMedia({ type: 'video', url, name })}
                                style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px', cursor: 'pointer' }}
                              >
                                {name && <track kind="captions" />}
                              </video>
                            );
                          } else if (mediaType.startsWith('audio/')) {
                            return (
                              <audio
                                key={idx}
                                src={getMediaUrl(url)}
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
                        })}
                      </div>
                    )}
                    {(!previewData.summary || showContent) && previewData.quoteUrl && (
                      <QuoteObject quoteUrl={previewData.quoteUrl} depth={0} maxDepth={3} />
                    )}
                  </div>
                )}
                {!previewData.content && previewData.quoteUrl && (
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
                      <QuoteObject quoteUrl={previewData.quoteUrl} depth={0} maxDepth={3} />
                    )}
                  </div>
                )}
              </>
            )}
            <div style={{ marginTop: '1rem' }}>
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f0f0f0',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem'
                }}
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
              src={getMediaUrl(fullscreenMedia.url)}
              alt={fullscreenMedia.name || ''}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain' }}
            />
          ) : (
            <video
              src={getMediaUrl(fullscreenMedia.url)}
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
