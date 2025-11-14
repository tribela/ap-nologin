import React, { useState, useEffect } from 'react';
import './App.css';

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
          src={emojiMap[emojiName]}
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
        actorId: actorInfo.id || null
      };
    }

    if (!data || !data.attributedTo) {
      return { handle: null, nickname: null, fallback: null, tags: [], actorId: null };
    }

    if (typeof data.attributedTo === 'string') {
      return { handle: null, nickname: null, fallback: data.attributedTo, tags: [], actorId: data.attributedTo };
    }

    if (typeof data.attributedTo === 'object' && data.attributedTo !== null) {
      const handle = data.attributedTo.preferredUsername || '';
      const nickname = data.attributedTo.name || null;
      const fallback = data.attributedTo.id || JSON.stringify(data.attributedTo);
      const tags = data.attributedTo.tag || [];
      const actorId = data.attributedTo.id || null;
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
      return { handle: fullHandle, nickname, fallback, tags, actorId };
    }

    return { handle: null, nickname: null, fallback: null, tags: [], actorId: null };
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

  const { handle, nickname, fallback, tags, actorId } = parseAttributedTo(quoteData, quoteActorInfo);

  return (
    <div className="content-html" style={{ marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#fefefe' }}>
      {(quoteData.published || quoteData.attributedTo) && (
        <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
          {quoteData.attributedTo && (
            <>
              {renderNicknameWithEmojis(nickname, tags)}
              {nickname && handle && ' '}
              {handle && (
                actorId ? (
                  <a href={actorId} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: '#0066cc', cursor: 'pointer' }} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>
                    <span className="handle">{handle}</span>
                  </a>
                ) : (
                  <span className="handle">{handle}</span>
                )
              )}
              {!handle && !nickname && fallback && <span>{fallback}</span>}
            </>
          )}
          {quoteData.published && quoteData.attributedTo && ' • '}
          {quoteData.published && (
            quoteData.id ? (
              <a href={quoteData.id} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: '#0066cc', cursor: 'pointer' }} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>
                {new Date(quoteData.published).toISOString()}
              </a>
            ) : (
              <span>{new Date(quoteData.published).toISOString()}</span>
            )
          )}
        </div>
      )}
      {quoteData.content && (
        <div dangerouslySetInnerHTML={{ __html: quoteData.content }} />
      )}
      {quoteData.quoteUrl && (
        <QuoteObject quoteUrl={quoteData.quoteUrl} depth={depth + 1} maxDepth={maxDepth} />
      )}
    </div>
  );
}

function App() {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState('');
  const [previewData, setPreviewData] = useState(null);
  const [actorInfo, setActorInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
        actorId: actorInfo.id || null
      };
    }

    // Fallback to previewData
    if (!previewData || !previewData.attributedTo) {
      return { handle: null, nickname: null, fallback: null, tags: [], actorId: null };
    }

    if (typeof previewData.attributedTo === 'string') {
      return { handle: null, nickname: null, fallback: previewData.attributedTo, tags: [], actorId: previewData.attributedTo };
    }

    if (typeof previewData.attributedTo === 'object' && previewData.attributedTo !== null) {
      // Use data from previewData if available
      const handle = previewData.attributedTo.preferredUsername || '';
      const nickname = previewData.attributedTo.name || null;
      const fallback = previewData.attributedTo.id || JSON.stringify(previewData.attributedTo);
      const tags = previewData.attributedTo.tag || [];
      const actorId = previewData.attributedTo.id || null;
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
      return { handle: fullHandle, nickname, fallback, tags, actorId };
    }

    return { handle: null, nickname: null, fallback: null, tags: [], actorId: null };
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
              {loading ? 'Loading...' : 'Run'}
            </button>
          </div>
          {error && <div className="error-message">{error}</div>}
        </section>

        {preview && (
          <section className="preview-section">
            <h2>Preview</h2>
            {previewData && (
              <>
                {previewData.content && (
                  <div className="content-html">
                    {(previewData.published || previewData.attributedTo) && (() => {
                      const { handle, nickname, fallback, tags, actorId } = parseAttributedTo();
                      return (
                        <div style={{ marginBottom: '0.5rem', fontSize: '0.9rem', color: '#666' }}>
                          {previewData.attributedTo && (
                            <>
                              {renderNicknameWithEmojis(nickname, tags)}
                              {nickname && handle && ' '}
                              {handle && (
                                actorId ? (
                                  <a href={actorId} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: '#0066cc', cursor: 'pointer' }} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>
                                    <span className="handle">{handle}</span>
                                  </a>
                                ) : (
                                  <span className="handle">{handle}</span>
                                )
                              )}
                              {!handle && !nickname && fallback && <span>{fallback}</span>}
                            </>
                          )}
                          {previewData.published && previewData.attributedTo && ' • '}
                          {previewData.published && (
                            previewData.id ? (
                              <a href={previewData.id} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: '#0066cc', cursor: 'pointer' }} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>
                                {new Date(previewData.published).toISOString()}
                              </a>
                            ) : (
                              <span>{new Date(previewData.published).toISOString()}</span>
                            )
                          )}
                        </div>
                      );
                    })()}
                    <div dangerouslySetInnerHTML={{ __html: previewData.content }} />
                    {previewData.quoteUrl && (
                      <QuoteObject quoteUrl={previewData.quoteUrl} depth={0} maxDepth={3} />
                    )}
                  </div>
                )}
                {!previewData.content && previewData.quoteUrl && (
                  <div className="content-html">
                    <QuoteObject quoteUrl={previewData.quoteUrl} depth={0} maxDepth={3} />
                  </div>
                )}
              </>
            )}
            <div className="preview-content">
              <pre>{preview}</pre>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

export default App;
