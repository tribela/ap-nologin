import React, { useState, useEffect } from 'react';
import './App.css';

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
      return {
        handle: actorInfo.handle || '',
        nickname: actorInfo.nickname || null,
        fallback: null
      };
    }

    if (!data || !data.attributedTo) {
      return { handle: null, nickname: null, fallback: null };
    }

    if (typeof data.attributedTo === 'string') {
      return { handle: null, nickname: null, fallback: data.attributedTo };
    }

    if (typeof data.attributedTo === 'object' && data.attributedTo !== null) {
      const handle = data.attributedTo.preferredUsername || '';
      const nickname = data.attributedTo.name || null;
      const fallback = data.attributedTo.id || JSON.stringify(data.attributedTo);
      return { handle, nickname, fallback };
    }

    return { handle: null, nickname: null, fallback: null };
  };

  if (!quoteUrl || depth >= maxDepth) {
    return null;
  }

  if (loading) {
    return (
      <div className="quote-object" style={{ marginLeft: `${depth * 20}px`, marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px' }}>
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
      <div className="quote-object" style={{ marginLeft: `${depth * 20}px`, marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f9f9f9' }}>
        <div style={{ color, fontWeight: 'bold' }}>
          {errorStatus.message} ({errorStatus.code})
        </div>
      </div>
    );
  }

  if (!quoteData) {
    return null;
  }

  const { handle, nickname, fallback } = parseAttributedTo(quoteData, quoteActorInfo);

  return (
    <div className="quote-object" style={{ marginLeft: `${depth * 20}px`, marginTop: '1rem', padding: '1rem', border: '1px solid #ddd', borderRadius: '4px', backgroundColor: '#f9f9f9' }}>
      <div className="activitypub-info">
        <h4>Quoted ({depth + 1}/{maxDepth})</h4>
        <div className="info-grid">
          {quoteData.type && (
            <div className="info-item">
              <strong>Type:</strong> <span className="type-badge">{quoteData.type}</span>
            </div>
          )}
          {quoteData.id && (
            <div className="info-item">
              <strong>ID:</strong> <a href={quoteData.id} target="_blank" rel="noopener noreferrer">{quoteData.id}</a>
            </div>
          )}
          {quoteData.published && (
            <div className="info-item">
              <strong>Published:</strong> {new Date(quoteData.published).toISOString()}
            </div>
          )}
          {quoteData.attributedTo && (
            <div className="info-item">
              <strong>Attributed To:</strong>{' '}
              {nickname && <span className="nickname">{nickname}</span>}
              {nickname && handle && ' '}
              {handle && <span className="handle">@{handle}</span>}
              {!handle && !nickname && fallback && <span>{fallback}</span>}
            </div>
          )}
          {quoteData.content && (
            <div className="info-item full-width">
              <strong>Content:</strong>
              <div className="content-html" dangerouslySetInnerHTML={{ __html: quoteData.content }} />
            </div>
          )}
        </div>
      </div>
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
      return {
        handle: actorInfo.handle || '',
        nickname: actorInfo.nickname || null,
        fallback: null
      };
    }

    // Fallback to previewData
    if (!previewData || !previewData.attributedTo) {
      return { handle: null, nickname: null, fallback: null };
    }

    if (typeof previewData.attributedTo === 'string') {
      return { handle: null, nickname: null, fallback: previewData.attributedTo };
    }

    if (typeof previewData.attributedTo === 'object' && previewData.attributedTo !== null) {
      // Use data from previewData if available
      const handle = previewData.attributedTo.preferredUsername || '';
      const nickname = previewData.attributedTo.name || null;
      const fallback = previewData.attributedTo.id || JSON.stringify(previewData.attributedTo);
      return { handle, nickname, fallback };
    }

    return { handle: null, nickname: null, fallback: null };
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
              <div className="activitypub-info">
                <h3>ActivityPub Object</h3>
                <div className="info-grid">
                  {previewData.type && (
                    <div className="info-item">
                      <strong>Type:</strong> <span className="type-badge">{previewData.type}</span>
                    </div>
                  )}
                  {previewData.id && (
                    <div className="info-item">
                      <strong>ID:</strong> <a href={previewData.id} target="_blank" rel="noopener noreferrer">{previewData.id}</a>
                    </div>
                  )}
                  {previewData.published && (
                    <div className="info-item">
                      <strong>Published:</strong> {new Date(previewData.published).toISOString()}
                    </div>
                  )}
                  {previewData.attributedTo && (() => {
                    const { handle, nickname, fallback } = parseAttributedTo();
                    return (
                      <div className="info-item">
                        <strong>Attributed To:</strong>{' '}
                        {nickname && <span className="nickname">{nickname}</span>}
                        {nickname && handle && ' '}
                        {handle && <span className="handle">@{handle}</span>}
                        {!handle && !nickname && fallback && <span>{fallback}</span>}
                      </div>
                    );
                  })()}
                  {previewData.content && (
                    <div className="info-item full-width">
                      <strong>Content:</strong>
                      <div className="content-html" dangerouslySetInnerHTML={{ __html: previewData.content }} />
                    </div>
                  )}
                  {previewData.quoteUrl && (
                    <div className="info-item full-width">
                      <strong>Quote:</strong>
                      <QuoteObject quoteUrl={previewData.quoteUrl} depth={0} maxDepth={3} />
                    </div>
                  )}
                </div>
              </div>
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
