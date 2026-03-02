import React, { useState, useEffect } from 'react';
import ActivityObject from './ActivityObject';

export default function RepliesObject({
  repliesUrl,
  depth = 0,
  maxDepth = 3,
  renderQuote = null,
  fullscreenMedia = null,
  setFullscreenMedia = () => {},
  showSensitiveMedia = {},
  setShowSensitiveMedia = () => {}
}) {
  const [replies, setReplies] = useState([]);
  const [repliesSignedMedia, setRepliesSignedMedia] = useState({});
  const [actorInfoMap, setActorInfoMap] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const getActorUrl = (note) => {
    if (!note || !note.attributedTo) return null;
    if (typeof note.attributedTo === 'string') return note.attributedTo;
    if (typeof note.attributedTo === 'object' && note.attributedTo !== null && note.attributedTo.id) {
      return note.attributedTo.id;
    }
    return null;
  };

  useEffect(() => {
    if (!repliesUrl || depth >= maxDepth) {
      return;
    }

    const fetchReplies = async () => {
      setLoading(true);
      setError(null);
      setReplies([]);
      setRepliesSignedMedia({});
      setActorInfoMap({});
      try {
        const response = await fetch(`/api/activity?url=${encodeURIComponent(repliesUrl)}`, {
          method: 'GET',
        });

        if (response.status >= 400) {
          const data = await response.json().catch(() => ({}));
          setError(data.detail || data.error || `HTTP ${response.status} Error`);
          return;
        }

        const data = await response.json();
        if (response.ok && data.content) {
          const repliesData = data.content;
          let items = [];
          let currentPage = null;

          const pageItems = (page) => {
            if (!page || typeof page !== 'object') return [];
            if (Array.isArray(page.orderedItems)) return page.orderedItems;
            if (Array.isArray(page.items)) return page.items;
            return [];
          };
          const nextPageUrl = (page) => {
            if (!page || typeof page !== 'object') return null;
            const n = page.next;
            if (!n) return null;
            if (typeof n === 'string') return n;
            if (typeof n === 'object' && n !== null && n.id) return n.id;
            return null;
          };

          if (Array.isArray(repliesData.items)) {
            items = repliesData.items;
            currentPage = repliesData;
          } else if (Array.isArray(repliesData.orderedItems)) {
            items = repliesData.orderedItems;
            currentPage = repliesData;
          } else if (repliesData.first) {
            const firstRef = repliesData.first;
            if (typeof firstRef === 'string') {
              try {
                const firstResponse = await fetch(`/api/activity?url=${encodeURIComponent(firstRef)}`, { method: 'GET' });
                if (firstResponse.ok) {
                  const firstData = await firstResponse.json();
                  const page = firstData.content;
                  currentPage = page;
                  items = pageItems(page);
                }
              } catch (e) {
                console.error('Failed to fetch replies first page:', firstRef, e);
              }
            } else if (typeof firstRef === 'object' && firstRef !== null) {
              currentPage = firstRef;
              items = pageItems(firstRef);
            }
          }

          if (items.length === 0 && currentPage) {
            const nextUrl = nextPageUrl(currentPage);
            if (nextUrl) {
              try {
                const nextResponse = await fetch(`/api/activity?url=${encodeURIComponent(nextUrl)}`, { method: 'GET' });
                if (nextResponse.ok) {
                  const nextData = await nextResponse.json();
                  const nextPage = nextData.content;
                  items = pageItems(nextPage);
                }
              } catch (e) {
                console.error('Failed to fetch replies next page:', nextUrl, e);
              }
            }
          }

          // Items can be objects or URLs (strings)
          const replyUrls = items
            .map(item => typeof item === 'string' ? item : (item.id || null))
            .filter(Boolean);
          
          // Fetch each reply note
          const fetchedReplies = [];
          const signedMediaMap = {};
          
          for (const url of replyUrls.slice(0, 10)) { // Limit to 10 replies
            try {
              const replyResponse = await fetch(`/api/activity?url=${encodeURIComponent(url)}`, {
                method: 'GET',
              });
              if (replyResponse.ok) {
                const replyData = await replyResponse.json();
                if (replyData.content) {
                  fetchedReplies.push(replyData.content);
                  if (replyData._signed_media) {
                    Object.assign(signedMediaMap, replyData._signed_media);
                  }
                }
              }
            } catch (e) {
              console.error('Failed to fetch reply:', url, e);
            }
          }

          const actorUrls = [...new Set(fetchedReplies.map(getActorUrl).filter(Boolean))];
          const map = {};
          await Promise.all(
            actorUrls.map(async (actorUrl) => {
              try {
                const res = await fetch(`/api/webfinger?actor_url=${encodeURIComponent(actorUrl)}`);
                if (res.ok) {
                  const data = await res.json();
                  if (data.success) map[actorUrl] = data;
                }
              } catch (e) {
                console.error('Failed to fetch actor:', actorUrl, e);
              }
            })
          );

          setReplies(fetchedReplies);
          setRepliesSignedMedia(signedMediaMap);
          setActorInfoMap(map);
        }
      } catch (err) {
        console.error('Failed to fetch replies:', err);
        setError('Failed to fetch replies');
      } finally {
        setLoading(false);
      }
    };

    fetchReplies();
  }, [repliesUrl, depth, maxDepth]);

  if (!repliesUrl) {
    return null;
  }

  if (depth >= maxDepth) {
    return null;
  }

  if (loading) {
    return (
      <div className="replies-object replies-object--loading">
        <div className="replies-object__loading">Loading replies...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="replies-object replies-object--error">
        <div className="replies-object__error">{error}</div>
      </div>
    );
  }

  if (replies.length === 0) {
    return null;
  }

  const parseAttributedTo = (data, actorInfo) => {
    if (actorInfo && (actorInfo.handle || actorInfo.nickname || actorInfo.icon)) {
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
      let iconUrl = null;
      const icon = data.attributedTo.icon;
      if (icon) {
        if (typeof icon === 'object' && icon.url) {
          iconUrl = icon.url;
        } else if (typeof icon === 'string') {
          iconUrl = icon;
        }
      }
      let domain = '';
      if (data.attributedTo.id) {
        try {
          const url = new URL(data.attributedTo.id);
          domain = url.hostname;
        } catch (e) {}
      }
      const fullHandle = handle && domain ? `@${handle}@${domain}` : handle ? `@${handle}` : '';
      return { handle: fullHandle, nickname, fallback, tags, actorId, icon: iconUrl };
    }

    return { handle: null, nickname: null, fallback: null, tags: [], actorId: null, icon: null };
  };

  return (
    <div className="replies-object">
      <div className="replies-object__heading">
        💬 {replies.length} {replies.length === 1 ? 'reply' : 'replies'}
      </div>
      {replies.map((reply, idx) => (
        <ActivityObject
          key={reply.id || idx}
          data={reply}
          signedMedia={repliesSignedMedia}
          actorInfo={actorInfoMap[getActorUrl(reply)] ?? null}
          parseAttributedTo={parseAttributedTo}
          fullscreenMedia={fullscreenMedia}
          setFullscreenMedia={setFullscreenMedia}
          showSensitiveMedia={showSensitiveMedia}
          setShowSensitiveMedia={setShowSensitiveMedia}
          depth={depth + 1}
          maxDepth={maxDepth}
          renderQuote={renderQuote}
        />
      ))}
    </div>
  );
}
