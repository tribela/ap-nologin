import React, { useState, useEffect } from 'react';
import { getMediaUrl } from '../utils/emojiUtils';
import ActivityObject from './ActivityObject';

export default function ReplyObject({
  replyUrl,
  fullscreenMedia = null,
  setFullscreenMedia = () => {},
  showSensitiveMedia = {},
  setShowSensitiveMedia = () => {},
  renderQuote = null
}) {
  const [parentData, setParentData] = useState(null);
  const [parentSignedMedia, setParentSignedMedia] = useState({});
  const [parentActorInfo, setParentActorInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!replyUrl) return;

    const fetchParent = async () => {
      setLoading(true);
      setError(null);
      setParentData(null);
      setParentActorInfo(null);
      try {
        const response = await fetch(`/api/activity?url=${encodeURIComponent(replyUrl)}`, { method: 'GET' });
        if (response.status >= 400) {
          const data = await response.json().catch(() => ({}));
          setError(data.detail || data.error || `HTTP ${response.status} Error`);
          return;
        }
        const data = await response.json();
        if (response.ok && data.content) {
          setParentData(data.content);
          setParentSignedMedia(data._signed_media || {});
        }
      } catch (err) {
        console.error('Failed to fetch parent post:', err);
        setError('Failed to fetch parent post');
      } finally {
        setLoading(false);
      }
    };

    fetchParent();
  }, [replyUrl]);

  useEffect(() => {
    if (!parentData || !parentData.attributedTo) {
      setParentActorInfo(null);
      return;
    }

    const fetchActor = async () => {
      try {
        let actorUrl = typeof parentData.attributedTo === 'string'
          ? parentData.attributedTo
          : (parentData.attributedTo?.id ?? null);
        if (!actorUrl) {
          setParentActorInfo(null);
          return;
        }
        const response = await fetch(`/api/webfinger?actor_url=${encodeURIComponent(actorUrl)}`);
        if (response.ok) {
          const data = await response.json();
          setParentActorInfo(data.success ? data : null);
        } else {
          setParentActorInfo(null);
        }
      } catch (err) {
        setParentActorInfo(null);
      }
    };

    fetchActor();
  }, [parentData]);

  const parseAttributedTo = (data, actorInfo) => {
    if (actorInfo && (actorInfo.handle || actorInfo.nickname)) {
      const handle = actorInfo.handle || '';
      const domain = actorInfo.domain || '';
      const fullHandle = handle && domain ? `@${handle}@${domain}` : handle ? `@${handle}` : '';
      return {
        handle: fullHandle,
        nickname: actorInfo.nickname ?? null,
        fallback: null,
        tags: actorInfo.tag || [],
        actorId: actorInfo.id ?? null,
        icon: actorInfo.icon ?? null,
        signedMedia: actorInfo._signed_media || {}
      };
    }
    if (!data?.attributedTo) {
      return { handle: null, nickname: null, fallback: null, tags: [], actorId: null, icon: null };
    }
    if (typeof data.attributedTo === 'string') {
      return { handle: null, nickname: null, fallback: data.attributedTo, tags: [], actorId: data.attributedTo, icon: null };
    }
    const a = data.attributedTo;
    if (typeof a === 'object' && a !== null) {
      const handle = a.preferredUsername || '';
      const nickname = a.name ?? null;
      const fallback = a.id || JSON.stringify(a);
      const tags = a.tag || [];
      const actorId = a.id ?? null;
      let iconUrl = null;
      if (a.icon) {
        iconUrl = typeof a.icon === 'object' && a.icon?.url ? a.icon.url : (typeof a.icon === 'string' ? a.icon : null);
      }
      let domain = '';
      try {
        if (a.id) domain = new URL(a.id).hostname;
      } catch (_) {}
      const fullHandle = handle && domain ? `@${handle}@${domain}` : handle ? `@${handle}` : '';
      return { handle: fullHandle, nickname, fallback, tags, actorId, icon: iconUrl };
    }
    return { handle: null, nickname: null, fallback: null, tags: [], actorId: null, icon: null };
  };

  if (!replyUrl) return null;

  if (loading) {
    return (
      <div className="reply-object reply-object--loading">
        <span className="reply-object__label">In reply to</span>
        <span className="reply-object__loading"> Loading parent post...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="reply-object reply-object--error">
        <span className="reply-object__label">In reply to</span>
        <span className="reply-object__error">{error}</span>
      </div>
    );
  }

  if (!parentData) return null;

  return (
    <>
      <div className="reply-object">
        <div className="reply-object__label">In reply to</div>
        <ActivityObject
          data={parentData}
          signedMedia={parentSignedMedia}
          actorInfo={parentActorInfo}
          parseAttributedTo={parseAttributedTo}
          fullscreenMedia={fullscreenMedia}
          setFullscreenMedia={setFullscreenMedia}
          showSensitiveMedia={showSensitiveMedia}
          setShowSensitiveMedia={setShowSensitiveMedia}
          depth={0}
          maxDepth={1}
          renderQuote={renderQuote}
          showInReplyTo={false}
          showReplies={false}
        />
      </div>
      {fullscreenMedia && (
        <div
          className="reply-object-fullscreen"
          onClick={() => setFullscreenMedia(null)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.9)',
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
