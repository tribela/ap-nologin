import React, { useState } from 'react';
import './App.css';

function App() {
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState('');
  const [previewData, setPreviewData] = useState(null);
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
                      <strong>Published:</strong> {new Date(previewData.published).toLocaleString()}
                    </div>
                  )}
                  {previewData.attributedTo && (
                    <div className="info-item">
                      <strong>Attributed To:</strong> {typeof previewData.attributedTo === 'string' ? previewData.attributedTo : previewData.attributedTo.id || JSON.stringify(previewData.attributedTo)}
                    </div>
                  )}
                  {previewData.content && (
                    <div className="info-item full-width">
                      <strong>Content:</strong>
                      <div className="content-html" dangerouslySetInnerHTML={{ __html: previewData.content }} />
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
