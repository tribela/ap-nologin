import React from 'react';
import { getAudienceVisibility } from '../utils/activityPubHelpers';

export default function Audience({ audience }) {
  if (!audience) return null;
  
  const visibility = getAudienceVisibility(audience);
  
  // Show emoji for public/unlisted, otherwise show detailed list
  if (visibility === 'public' || visibility === 'unlisted') {
    return (
      <div className="audience-container audience-emoji-only">
        <span className="audience-emoji" title={visibility === 'public' ? 'Public' : 'Unlisted'}>
          {visibility === 'public' ? '🌐' : '🏠'}
        </span>
      </div>
    );
  }
  
  // Fallback to detailed list for other cases
  const renderAudienceList = (label, items, isPrivate = false) => {
    if (!Array.isArray(items) || items.length === 0) return null;
    const displayItems = items.slice(0, 3); // Show first 3
    const moreCount = items.length - displayItems.length;
    
    return (
      <div className="audience-item">
        <span className="audience-label">{label}:</span>
        <span className="audience-values">
          {displayItems.map((item, idx) => {
            const url = typeof item === 'string' ? item : (item.id || item.href || '');
            const name = typeof item === 'object' && item.name ? item.name : url;
            // Try to extract handle from URL or name
            let displayName = name;
            if (url && typeof url === 'string') {
              try {
                // Try to extract @handle@domain format
                const urlObj = new URL(url);
                const pathParts = urlObj.pathname.split('/');
                if (pathParts.length > 0 && pathParts[pathParts.length - 1]) {
                  const handle = pathParts[pathParts.length - 1];
                  if (handle && !handle.includes('@')) {
                    displayName = `@${handle}@${urlObj.hostname}`;
                  }
                }
              } catch (e) {
                // Invalid URL, use name as is
              }
            }
            
            return (
              <React.Fragment key={idx}>
                {url && url.startsWith('http') ? (
                  <a 
                    href={url} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className={isPrivate ? 'audience-link audience-private' : 'audience-link'}
                  >
                    {displayName}
                  </a>
                ) : (
                  <span className={isPrivate ? 'audience-private' : ''}>
                    {displayName}
                  </span>
                )}
                {idx < displayItems.length - 1 && <span className="audience-separator">, </span>}
              </React.Fragment>
            );
          })}
          {moreCount > 0 && <span className="audience-more"> (+{moreCount} more)</span>}
        </span>
      </div>
    );
  };
  
  return (
    <div className="audience-container">
      {renderAudienceList('To', audience.to)}
      {renderAudienceList('CC', audience.cc)}
      {renderAudienceList('BTo', audience.bto, true)}
      {renderAudienceList('BCC', audience.bcc, true)}
    </div>
  );
}

