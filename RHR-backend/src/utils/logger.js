const isProd = process.env.NODE_ENV === 'production';

const logger = {
  debug: (...args) => {
    if (!isProd) console.log('[DEBUG]', ...args);
  },

  info: (...args) => {
    console.log('[INFO]', new Date().toISOString(), ...args);
  },

  warn: (...args) => {
    console.warn('[WARN]', new Date().toISOString(), ...args);
  },

  // Never logs the raw error object/stack in production — only the message.
  error: (message, err = null) => {
    if (isProd) {
      console.error('[ERROR]', new Date().toISOString(), message);
    } else {
      console.error('[ERROR]', new Date().toISOString(), message, err);
    }
  }
};

module.exports = { logger, isProd };
