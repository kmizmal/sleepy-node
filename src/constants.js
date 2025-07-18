// constants.js
module.exports = {
    LOG_CATEGORIES: {
      AUTH: 'AUTH',
      SSE: 'SSE',
      API: 'API',
      CORS: 'CORS',
      RATE_LIMIT: 'RATE_LIMIT',
      SYSTEM: 'SYSTEM',
      SECURITY: 'SECURITY'
    },
    
    getCategoryIcon: (category) => {
      const icons = {
        AUTH: '🔐',
        SSE: '⚡',
        API: '🔄',
        CORS: '🌐',
        RATE_LIMIT: '⚠️',
        SYSTEM: '🚀',
        SECURITY: '🛡️'
      };
      return icons[category] || '📝';
    }
  };