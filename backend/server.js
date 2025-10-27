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
  origin: 'http://localhost:3000',
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

app.get('/api/campaigns', requireAuth, async (req, res) => {
  // console.log("reached first");
  const { advertiser_id, page_size = 25 } = req.query;
  const finalAdvertiserId = advertiser_id?.startsWith('act_')
  ? advertiser_id
  : `act_${advertiser_id || process.env.ADVERTISER_ID}`;
  
  try {
      const endpoint = `https://graph.facebook.com/v24.0/${finalAdvertiserId}?fields=campaigns%7Bid%2Cname%2Cobjective%2Cstatus%2Cdaily_budget%2Ccreated_time%7D&access_token=${req.session.metaAccessToken}`;

      // console.log("entered try block"+metaAccessToken);
    
    const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${req.session.metaAccessToken}` },
    });
    
    // console.log("Full response data:", response.data);

    // ✅ Access campaigns properly
    const campaigns = response.data.campaigns?.data || [];
    // console.log("Fetched campaigns:", campaigns);

    res.json({ campaigns });
    // res.json(response.data);
  } catch (err) {
    console.error('Meta API Error:', err.response?.data || err.message);
    res.status(500).json({
      error: 'Failed to fetch campaign data from Meta API.',
      details: err.response?.data || err.message,
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