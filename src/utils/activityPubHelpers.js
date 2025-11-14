// Helper function to extract quote URL from various field names
export function getQuoteUrl(data) {
  if (!data || typeof data !== 'object') return null;
  // Try multiple possible field names
  return data.quoteUrl || data.quote || data.quoteUri || data._misskey_quote || null;
}

// Helper function to extract content from various field names (including Misskey)
export function getContent(data) {
  if (!data || typeof data !== 'object') return null;
  // Try content, _misskey_content, or source.content
  const content = data.content || data._misskey_content || (data.source && data.source.content) || null;
  // Return content if it's a non-empty string
  return (typeof content === 'string' && content.trim()) ? content : null;
}

// Helper function to format date as YYYY-mm-DD HH:MM:SS
export function formatDate(dateString) {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString; // Invalid date, return original

    // Format: YYYY-mm-DD HH:MM:SS
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  } catch (e) {
    return dateString; // Return original if formatting fails
  }
}

// Helper function to extract poll data from ActivityPub object
export function getPollData(data) {
  if (!data || typeof data !== 'object') return null;
  // Check for oneOf or anyOf (poll options)
  const pollOptions = data.oneOf || data.anyOf || null;
  if (!pollOptions || !Array.isArray(pollOptions) || pollOptions.length === 0) return null;
  
  // Determine which field was used
  const pollType = data.oneOf ? 'oneOf' : (data.anyOf ? 'anyOf' : null);
  
  return {
    options: pollOptions,
    closed: data.closed || false,
    endTime: data.endTime || null,
    voterCount: data.votersCount || null,
    pollType: pollType
  };
}

// Helper function to check if audience contains Public
function isPublicAudience(audienceArray) {
  if (!Array.isArray(audienceArray)) return false;
  return audienceArray.some(item => {
    const value = typeof item === 'string' ? item : (item.id || item.href || '');
    return value === 'https://www.w3.org/ns/activitystreams#Public' ||
           value === 'as:Public' ||
           value === 'Public' ||
           value.includes('#Public') ||
           value.includes('activitystreams#Public');
  });
}

// Helper function to determine audience visibility type
export function getAudienceVisibility(audience) {
  if (!audience) return null;
  
  const to = audience.to || [];
  const cc = audience.cc || [];
  
  const hasPublic = isPublicAudience(to) || isPublicAudience(cc);
  
  if (hasPublic) {
    return 'public';
  }
  
  // Check if unlisted (public not in to, but in cc or has followers)
  const hasPublicInTo = isPublicAudience(to);
  const hasPublicInCc = isPublicAudience(cc);
  const hasFollowers = to.some(item => {
    const value = typeof item === 'string' ? item : (item.id || item.href || '');
    return value.includes('followers') || value.includes('/followers');
  });
  
  if (!hasPublicInTo && (hasPublicInCc || hasFollowers || cc.length > 0)) {
    return 'unlisted';
  }
  
  return null;
}

// Helper function to extract audience (to/cc/bto/bcc)
export function getAudience(data) {
  if (!data || typeof data !== 'object') return null;
  const audience = {
    to: data.to || [],
    cc: data.cc || [],
    bto: data.bto || [],
    bcc: data.bcc || []
  };
  // Convert to arrays if they're strings
  ['to', 'cc', 'bto', 'bcc'].forEach(key => {
    if (typeof audience[key] === 'string') {
      audience[key] = [audience[key]];
    }
  });
  // Check if any audience field has values
  const hasAudience = ['to', 'cc', 'bto', 'bcc'].some(key => 
    Array.isArray(audience[key]) && audience[key].length > 0
  );
  return hasAudience ? audience : null;
}

// Helper function to extract Link objects from attachment
export function getLinkPreviews(data) {
  if (!data || typeof data !== 'object') return [];
  const attachments = data.attachment || [];
  return attachments.filter(att => {
    if (typeof att === 'object' && att !== null) {
      return att.type === 'Link' || (att.href && !att.mediaType);
    }
    return false;
  });
}

// Helper function to separate hashtags and mentions from tags
export function categorizeTags(tags = []) {
  const hashtags = [];
  const mentions = [];
  const other = [];
  
  if (!Array.isArray(tags)) return { hashtags, mentions, other };
  
  tags.forEach(tag => {
    if (typeof tag === 'object' && tag !== null) {
      if (tag.type === 'Hashtag' || tag.type === 'http://www.w3.org/ns/activitystreams#Hashtag') {
        hashtags.push(tag);
      } else if (tag.type === 'Mention' || tag.type === 'http://www.w3.org/ns/activitystreams#Mention') {
        mentions.push(tag);
      } else {
        other.push(tag);
      }
    }
  });
  
  return { hashtags, mentions, other };
}

