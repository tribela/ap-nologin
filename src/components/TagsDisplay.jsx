import React from 'react';
import { categorizeTags } from '../utils/activityPubHelpers';

export default function TagsDisplay({ tags, signedMedia = {} }) {
  const { hashtags, mentions } = categorizeTags(tags);
  
  if (hashtags.length === 0 && mentions.length === 0) return null;
  
  return (
    <div className="tags-container">
      {hashtags.length > 0 && (
        <div className="hashtags">
          {hashtags.map((tag) => {
            const key = `hashtag-${tag.name}-${tag.href}`;
            const name = tag.name || tag.href || '';
            const href = tag.href || `#${name.replace('#', '')}`;
            return (
              <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="hashtag">
                #{name.replace('#', '')}
              </a>
            );
          })}
        </div>
      )}
      {mentions.length > 0 && (
        <div className="mentions">
          {mentions.map((mention) => {
            const key = `mention-${mention.name}-${mention.href}`;
            const href = mention.href || mention.id || '';
            const name = mention.name || href;
            return (
              <a key={key} href={href} target="_blank" rel="noopener noreferrer" className="mention">
                @{name}
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

