import React, { useState } from 'react';
import { getContent, getPollData, getQuoteUrl, getAudience, getLinkPreviews } from '../utils/activityPubHelpers';
import { renderHtmlWithEmojis, getMediaUrl } from '../utils/emojiUtils';
import UserHeader from './UserHeader';
import Poll from './Poll';
import LinkPreview from './LinkPreview';
export default function ActivityObject({ 
  data, 
  signedMedia = {}, 
  actorInfo = null,
  parseAttributedTo,
  fullscreenMedia,
  setFullscreenMedia,
  showSensitiveMedia = {},
  setShowSensitiveMedia,
  depth = 0,
  maxDepth = 3,
  containerStyle = {},
  renderQuote = null
}) {
  const [showContent, setShowContent] = useState(false);

  if (!data) return null;

  const { handle, nickname, fallback, tags, actorId, icon, signedMedia: actorSignedMedia } = parseAttributedTo(data, actorInfo);
  const hasCW = !!data.summary;
  const shouldShowContent = !hasCW || showContent;
  const shouldShowAttachments = !hasCW || showContent;
  const mergedSignedMedia = { ...signedMedia, ...(actorSignedMedia || {}) };

  return (
    <div className="content-html" style={containerStyle}>
      {(data.published || data.attributedTo) && (
        <UserHeader
          nickname={nickname}
          handle={handle}
          fallback={fallback}
          tags={tags}
          actorId={actorId}
          icon={icon}
          published={data.published}
          updated={data.updated}
          postId={data.id}
          audience={getAudience(data)}
          signedMedia={mergedSignedMedia}
        />
      )}
      {data.summary && (
        <div className="content-warning">
          <strong>Content Warning:</strong> {data.summary}
          <button
            onClick={() => setShowContent(!showContent)}
          >
            {showContent ? 'Hide' : 'Show'}
          </button>
        </div>
      )}
      {shouldShowContent && getContent(data) && (
        <div className="content-body">{renderHtmlWithEmojis(getContent(data), data.tag || [], mergedSignedMedia)}</div>
      )}
      {shouldShowContent && (() => {
        const linkPreviews = getLinkPreviews(data);
        const mediaAttachments = (data.attachment || []).filter(att => {
          if (typeof att === 'object' && att !== null) {
            return att.type !== 'Link' && (att.mediaType || att.type);
          }
          return true;
        });
        return (
          <>
            {linkPreviews.length > 0 && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {linkPreviews.map((link, idx) => (
                  <LinkPreview key={idx} link={link} />
                ))}
              </div>
            )}
            {mediaAttachments.length > 0 && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                {mediaAttachments.map((att, idx) => {
                  let url = null;
                  if (typeof att === 'string') {
                    url = att;
                  } else if (att && typeof att === 'object') {
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

                  if (isSensitive && !shouldShowAttachments) return null;

                  const signature = mergedSignedMedia[url] || null;
                  const mediaElement = (() => {
                    if (mediaType.startsWith('image/')) {
                      return (
                        <img
                          key={idx}
                          src={getMediaUrl(url, signature)}
                          alt={name}
                          onClick={() => setFullscreenMedia && setFullscreenMedia({ type: 'image', url, name, signature })}
                          style={{ maxWidth: '100%', maxHeight: '400px', borderRadius: '4px', objectFit: 'contain', cursor: 'pointer' }}
                        />
                      );
                    } else if (mediaType.startsWith('video/')) {
                      return (
                        <video
                          key={idx}
                          src={getMediaUrl(url, signature)}
                          controls
                          onClick={() => setFullscreenMedia && setFullscreenMedia({ type: 'video', url, name, signature })}
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
                            onClick={() => setShowSensitiveMedia && setShowSensitiveMedia({ ...showSensitiveMedia, [mediaKey]: false })}
                            className="sensitive-media-hide-button"
                            title="Hide sensitive content"
                          >
                            👁️
                          </div>
                        )}
                        <div
                          onClick={() => !isMediaShown && setShowSensitiveMedia && setShowSensitiveMedia({ ...showSensitiveMedia, [mediaKey]: true })}
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
          </>
        );
      })()}
      {shouldShowContent && (() => {
        const pollData = getPollData(data);
        return pollData ? <Poll pollData={pollData} /> : null;
      })()}
      {shouldShowContent && getQuoteUrl(data) && renderQuote && (
        renderQuote(getQuoteUrl(data), depth, maxDepth)
      )}
    </div>
  );
}

