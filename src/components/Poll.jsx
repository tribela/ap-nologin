import React from 'react';
import { formatDate } from '../utils/activityPubHelpers';

export default function Poll({ pollData }) {
  if (!pollData || !pollData.options || !Array.isArray(pollData.options)) {
    return null;
  }

  // Calculate total votes
  const totalVotes = pollData.options.reduce((sum, option) => {
    const votes = typeof option.replies === 'object' && option.replies !== null
      ? (option.replies.totalItems || option.replies || 0)
      : (option.replies || 0);
    return sum + (typeof votes === 'number' ? votes : 0);
  }, 0);

  // Check if poll is closed
  const isClosed = pollData.closed || (pollData.endTime && new Date(pollData.endTime) < new Date());

  return (
    <div className="poll-container">
      <div className="poll-header">
        <strong>Poll</strong>
        {pollData.pollType && (
          <span className="poll-type" title={pollData.pollType}>
            {pollData.pollType === 'oneOf' ? (
              <span className="poll-type-icon">🔘</span>
            ) : (
              <span className="poll-type-icon">☑️</span>
            )}
          </span>
        )}
        {pollData.endTime && (
          <span className="poll-end-time">
            {isClosed ? 'Closed' : `Ends: ${formatDate(pollData.endTime)}`}
          </span>
        )}
        {pollData.voterCount !== null && (
          <span className="poll-voter-count">
            {pollData.voterCount} {pollData.voterCount === 1 ? 'vote' : 'votes'}
          </span>
        )}
      </div>
      <div className="poll-options">
        {pollData.options.map((option, idx) => {
          const votes = typeof option.replies === 'object' && option.replies !== null
            ? (option.replies.totalItems || option.replies || 0)
            : (option.replies || 0);
          const voteCount = typeof votes === 'number' ? votes : 0;
          const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
          const optionName = option.name || option.content || `Option ${idx + 1}`;

          return (
            <div key={idx} className="poll-option">
              <div className="poll-option-header">
                <span className="poll-option-name">{optionName}</span>
                <span className="poll-option-stats">
                  {voteCount} ({percentage}%)
                </span>
              </div>
              <div className="poll-option-bar-container">
                <div 
                  className="poll-option-bar" 
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      {totalVotes > 0 && (
        <div className="poll-footer">
          <span className="poll-total-votes">{totalVotes} total {totalVotes === 1 ? 'vote' : 'votes'}</span>
        </div>
      )}
    </div>
  );
}

