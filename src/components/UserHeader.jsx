import React from 'react';
import { getMediaUrl, renderNicknameWithEmojis } from '../utils/emojiUtils';
import { formatDate, getAudienceVisibility } from '../utils/activityPubHelpers';

export default function UserHeader({ nickname, handle, fallback, tags, actorId, icon, published, updated, postId, audience, signedMedia = {} }) {
  const iconSignature = icon ? (signedMedia[icon] || null) : null;
  const visibility = audience ? getAudienceVisibility(audience) : null;
  
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
      <div className="user-header-dates">
        {published && (
          <div className="user-header-date">
            {postId ? (
              <a href={postId} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', color: 'inherit', cursor: 'pointer' }} onMouseEnter={(e) => e.target.style.textDecoration = 'underline'} onMouseLeave={(e) => e.target.style.textDecoration = 'none'}>
                {formatDate(published)}
              </a>
            ) : (
              <span>{formatDate(published)}</span>
            )}
            {visibility && (
              <span className="user-header-audience-emoji" title={visibility === 'public' ? 'Public' : 'Unlisted'}>
                {visibility === 'public' ? '🌐' : '🏠'}
              </span>
            )}
          </div>
        )}
        {updated && updated !== published && (
          <div className="user-header-date user-header-updated">
            <span title="Updated">(updated: {formatDate(updated)})</span>
          </div>
        )}
      </div>
    </div>
  );
}

