import React from 'react';
import { getMediaUrl } from '../utils/emojiUtils';

export default function LinkPreview({ link }) {
  if (!link || typeof link !== 'object') return null;
  
  const href = link.href || link.url || null;
  const name = link.name || link.summary || href;
  const mediaType = link.mediaType || link.type || '';
  const preview = link.preview || null;
  
  if (!href) return null;
  
  return (
    <div className="link-preview">
      {preview && typeof preview === 'object' && preview.url && (
        <div className="link-preview-image">
          <img src={getMediaUrl(preview.url, null)} alt={name} />
        </div>
      )}
      <div className="link-preview-content">
        <a href={href} target="_blank" rel="noopener noreferrer" className="link-preview-link">
          {name}
        </a>
        {mediaType && <span className="link-preview-type">{mediaType}</span>}
      </div>
    </div>
  );
}

