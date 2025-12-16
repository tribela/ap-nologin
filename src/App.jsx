import React, { useState, useEffect } from 'react';
import './App.scss';
import { getMediaUrl } from './utils/emojiUtils';
import { getQuoteUrl, getContent } from './utils/activityPubHelpers';
import SearchIcon from './icons/SearchIcon.svg?react';
import LoadingIcon from './icons/LoadingIcon.svg?react';
import ShareIcon from './icons/ShareIcon.svg?react';
import ActivityObject from './components/ActivityObject';


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

  return (
    <>
    <ActivityObject
      data={quoteData}
      signedMedia={quoteSignedMedia}
      actorInfo={quoteActorInfo}
      parseAttributedTo={parseAttributedTo}
      fullscreenMedia={fullscreenMedia}
      setFullscreenMedia={setFullscreenMedia}
      showSensitiveMedia={showSensitiveMedia}
      setShowSensitiveMedia={setShowSensitiveMedia}
      depth={depth + 1}
      maxDepth={maxDepth}
      containerStyle={{ marginTop: '1rem', padding: '1rem' }}
      renderQuote={(quoteUrl, quoteDepth, quoteMaxDepth) => (
        <QuoteObject quoteUrl={quoteUrl} depth={quoteDepth} maxDepth={quoteMaxDepth} />
      )}
    />
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

  // Fetch activity data for a given URL
  const fetchActivity = async (targetUrl) => {
    if (!targetUrl.trim()) {
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
      const response = await fetch(`/api/activity?url=${encodeURIComponent(targetUrl.trim())}`, {
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

      // Update browser URL with the searched URL
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('url', targetUrl.trim());
      window.history.replaceState({}, '', newUrl.toString());
    } catch (err) {
      setError('Failed to fetch preview');
      console.error('Error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Read 'url' parameter from query string on initial load and auto-fetch
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlParam = params.get('url');
    if (urlParam) {
      setUrl(urlParam);
      fetchActivity(urlParam);
    }
  }, []);

  const handleRun = async () => {
    await fetchActivity(url);
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

  const handleShare = async () => {
    // Build share URL - keep URL readable but encode whitespace
    const baseUrl = window.location.origin + window.location.pathname;
    const safeUrl = url.trim().replace(/\s/g, '%20');
    const shareUrl = url.trim() ? `${baseUrl}?url=${safeUrl}` : baseUrl;

    if (!navigator.share) {
      // Fallback: copy to clipboard
      try {
        await navigator.clipboard.writeText(shareUrl);
        alert('URL copied to clipboard');
      } catch (err) {
        console.error('Failed to copy:', err);
      }
      return;
    }

    try {
      await navigator.share({
        title: 'AP NoLogin',
        url: shareUrl
      });
    } catch (err) {
      // User cancelled or share failed
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
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
                  <ActivityObject
                    data={previewData}
                    signedMedia={previewSignedMedia}
                    actorInfo={actorInfo}
                    parseAttributedTo={(data, info) => {
                      if (info && (info.handle || info.nickname)) {
                        const handle = info.handle || '';
                        const domain = info.domain || '';
                        const fullHandle = handle && domain ? `@${handle}@${domain}` : handle ? `@${handle}` : '';
                        return {
                          handle: fullHandle,
                          nickname: info.nickname || null,
                          fallback: null,
                          tags: info.tag || [],
                          actorId: info.id || null,
                          icon: info.icon || null,
                          signedMedia: info._signed_media || {}
                        };
                      }
                      return parseAttributedTo();
                    }}
                    fullscreenMedia={fullscreenMedia}
                    setFullscreenMedia={setFullscreenMedia}
                    showSensitiveMedia={showSensitiveMedia}
                    setShowSensitiveMedia={setShowSensitiveMedia}
                    depth={0}
                    maxDepth={3}
                    renderQuote={(quoteUrl, quoteDepth, quoteMaxDepth) => (
                      <QuoteObject quoteUrl={quoteUrl} depth={quoteDepth} maxDepth={quoteMaxDepth} />
                    )}
                  />
                )}
                {!getContent(previewData) && getQuoteUrl(previewData) && (
                  <ActivityObject
                    data={previewData}
                    signedMedia={previewSignedMedia}
                    actorInfo={actorInfo}
                    parseAttributedTo={(data, info) => {
                      if (info && (info.handle || info.nickname)) {
                        const handle = info.handle || '';
                        const domain = info.domain || '';
                        const fullHandle = handle && domain ? `@${handle}@${domain}` : handle ? `@${handle}` : '';
                        return {
                          handle: fullHandle,
                          nickname: info.nickname || null,
                          fallback: null,
                          tags: info.tag || [],
                          actorId: info.id || null,
                          icon: info.icon || null,
                          signedMedia: info._signed_media || {}
                        };
                      }
                      return parseAttributedTo();
                    }}
                    fullscreenMedia={fullscreenMedia}
                    setFullscreenMedia={setFullscreenMedia}
                    showSensitiveMedia={showSensitiveMedia}
                    setShowSensitiveMedia={setShowSensitiveMedia}
                    depth={0}
                    maxDepth={3}
                    renderQuote={(quoteUrl, quoteDepth, quoteMaxDepth) => (
                      <QuoteObject quoteUrl={quoteUrl} depth={quoteDepth} maxDepth={quoteMaxDepth} />
                    )}
                  />
                )}
              </>
            )}
            <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <button
                className="raw-json-button"
                onClick={() => setShowRawJson(!showRawJson)}
              >
                {showRawJson ? 'Hide' : 'Show'} Raw JSON
              </button>
              <button
                className="share-button"
                onClick={handleShare}
                title="Share"
              >
                <ShareIcon />
                Share
              </button>
            </div>
            <div>
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
