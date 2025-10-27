const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const session = require('express-session');
const axios = require('axios'); 
const qs = require('querystring'); 
const adsSdk = require('facebook-nodejs-business-sdk');

// --- CONFIGURATION & ENVIRONMENT ---
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;

const FACEBOOK_LOGIN_BASE = 'https://www.facebook.com'; 
// 2. For specific Meta Marketing Open API v1.3
const OPEN_API_BASE = 'https://adsapi.cn.messenger.com'; 
const API_VERSION = 'v1.3';
const GRAPH_API_VERSION = 'v24.0'; // Used for token exchange

// Auth middleware to check if user is authenticated
const requireAuth = (req, res, next) => {
  if (!req.session.metaAccessToken) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
};

// --- MIDDLEWARE ---
// Configure CORS to allow access from the React frontend (running on port 3000)
app.use(cors({
  origin: 'https://meta-api-connection.vercel.app/',
  credentials: true
}));
app.use(express.json());

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// ==========================================================
// 1. AUTHENTICATION (OAuth 2.0 Server-Side Flow)
// ==========================================================

// Route 1: Initiates the OAuth flow. Frontend redirects to this.
app.get('/auth/meta', (req, res) => {
    const scopes = 'ads_read, ads_management, business_management'; 
    
    // **FIXED URL:** Uses FACEBOOK_LOGIN_BASE for the dialog redirect.
    const dialogUrl = `${FACEBOOK_LOGIN_BASE}/${GRAPH_API_VERSION}/dialog/oauth?client_id=${process.env.META_APP_ID}&redirect_uri=${process.env.REDIRECT_URI}&scope=ads_management`;
    console.log('Initiating OAuth login...');
    res.redirect(dialogUrl);
});

// Route 2: Callback URL to exchange the authorization code for an Access Token.
// Check authentication status
app.get('/auth/status', (req, res) => {
  res.json({ 
    authenticated: !!req.session.metaAccessToken,
    expiresAt: req.session.tokenExpiresAt
  });
});

app.get('/auth/meta/callback', async (req, res) => {
    const { code, error, error_reason } = req.query;
    
    // Handle error returned by Meta if the user denied access
    if (error) {
        console.error('Meta Auth Error:', error_reason);
        return res.redirect(`http://localhost:3000/?authError=${error_reason}`);
    }

    try {
        // Exchange the code for an Access Token using the Graph API endpoint
        const tokenExchangeUrl = `https://graph.facebook.com/v24.0/oauth/access_token?client_id=${process.env.META_APP_ID}&redirect_uri=${process.env.REDIRECT_URI}&client_secret=${process.env.META_APP_SECRET}&code=${code}`;
        
        const tokenResponse = await axios.get(tokenExchangeUrl);
        req.session.metaAccessToken = tokenResponse.data.access_token;
        // Set token expiration (default to 2 hours from now if not provided)
        const expiresIn = tokenResponse.data.expires_in || 7200; // Default to 2 hours
        req.session.tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);
        
        console.log('✅ Access Token acquired and stored in session.');
        // Redirect user back to the frontend with a success flag
        res.redirect('http://localhost:3000/?authSuccess=true');

    } catch (err) {
        console.error('Token Exchange Failed:', err.response ? err.response.data : err.message);
        const errorMessage = err.response ? JSON.stringify(err.response.data) : 'Token_exchange_failed';
        res.redirect(`http://localhost:3000/?authError=${encodeURIComponent(errorMessage)}`);
    }
});

// Error handler for Meta API errors
const handleMetaApiError = (error) => {
  console.error('Meta API Error:', error.response?.data || error.message);
  
  if (error.response) {
    const { status, data } = error.response;
    
    // Handle different error status codes
    switch (status) {
      case 400:
        return {
          status: 400,
          error: 'Invalid Request',
          message: data.error?.message || 'The request was malformed or missing required parameters.',
          details: data.error || {},
          type: 'VALIDATION_ERROR'
        };
      case 401:
        return {
          status: 401,
          error: 'Unauthorized',
          message: 'Your session has expired or the access token is invalid. Please log in again.',
          type: 'AUTH_ERROR'
        };
      case 403:
        return {
          status: 403,
          error: 'Forbidden',
          message: 'You do not have permission to access this resource.',
          details: data.error || {},
          type: 'PERMISSION_ERROR'
        };
      case 404:
        return {
          status: 404,
          error: 'Not Found',
          message: 'The requested advertiser account or resource was not found.',
          type: 'NOT_FOUND_ERROR'
        };
      case 429:
        return {
          status: 429,
          error: 'Rate Limit Exceeded',
          message: 'Too many requests. Please wait before making additional requests.',
          type: 'RATE_LIMIT_ERROR',
          retryAfter: error.response.headers['retry-after'] || 60
        };
      case 500:
      case 502:
      case 503:
      case 504:
        return {
          status,
          error: 'Service Unavailable',
          message: 'The Meta API is currently unavailable. Please try again later.',
          type: 'API_UNAVAILABLE_ERROR'
        };
      default:
        return {
          status: status || 500,
          error: 'API Request Failed',
          message: data.error?.message || 'An unknown error occurred while fetching data from Meta API.',
          details: data.error || {},
          type: 'API_ERROR'
        };
    }
  } else if (error.request) {
    // The request was made but no response was received
    return {
      status: 503,
      error: 'Network Error',
      message: 'Unable to connect to the Meta API. Please check your internet connection and try again.',
      type: 'NETWORK_ERROR'
    };
  } else {
    // Something happened in setting up the request that triggered an Error
    return {
      status: 500,
      error: 'Request Error',
      message: 'An error occurred while setting up the request.',
      details: error.message,
      type: 'REQUEST_ERROR'
    };
  }
};

app.get('/api/campaigns', requireAuth, async (req, res) => {
  const { advertiser_id, page_size = 25 } = req.query;
  
  // Validate advertiser_id
  if (!advertiser_id) {
    return res.status(400).json({
      status: 400,
      error: 'Missing Parameter',
      message: 'advertiser_id is required',
      type: 'VALIDATION_ERROR'
    });
  }

  const finalAdvertiserId = advertiser_id.startsWith('act_')
    ? advertiser_id
    : `act_${advertiser_id}`;

  try {
    const endpoint = `https://graph.facebook.com/v24.0/${finalAdvertiserId}?fields=campaigns%7Bid%2Cname%2Cobjective%2Cstatus%2Cdaily_budget%2Ccreated_time%7D`;
    
    const response = await axios.get(endpoint, {
      headers: { 
        Authorization: `Bearer ${req.session.metaAccessToken}`,
        'Content-Type': 'application/json'
      },
      timeout: 10000 // 10 second timeout
    });

    // Handle empty or invalid response
    if (!response.data || !response.data.campaigns) {
      return res.status(200).json({ 
        campaigns: [],
        message: 'No campaigns found for this advertiser account.'
      });
    }

    const campaigns = response.data.campaigns?.data || [];
    res.json({ 
      campaigns,
      pagination: {
        total: campaigns.length,
        page_size: parseInt(page_size, 10) || 25
      }
    });
    
  } catch (error) {
    const errorResponse = handleMetaApiError(error);
    
    // If it's an authentication error, clear the session
    if (errorResponse.type === 'AUTH_ERROR') {
      req.session.destroy();
    }
    
    res.status(errorResponse.status || 500).json({
      error: errorResponse.error,
      message: errorResponse.message,
      type: errorResponse.type,
      ...(process.env.NODE_ENV === 'development' && {
        details: errorResponse.details,
        stack: error.stack
      })
    });
  }
});



// ==========================================================
// 3. SERVER START
// ==========================================================

app.listen(PORT, () => {
    console.log(`Backend Server running on http://localhost:${PORT}`);
    console.log(`Redirect URI set to: ${process.env.REDIRECT_URI}`);
    console.log('--- READY ---');
});