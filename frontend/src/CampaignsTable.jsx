
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:5000';

// Configure axios to send cookies with requests
axios.defaults.withCredentials = true;

const CampaignsTable = () => {
    const [allCampaigns, setAllCampaigns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [authStatus, setAuthStatus] = useState('CHECKING'); // CHECKING, LOGGED_OUT, AUTHENTICATED, ERROR
    const [apiError, setApiError] = useState(null);
    const [advertiserId, setAdvertiserId] = useState(() => {
      // Try to get from URL params first
      const params = new URLSearchParams(window.location.search);
      return params.get('advertiser_id') || '';
    });
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState(''); // Nice-to-Have filter
    const [sortConfig, setSortConfig] = useState({ key: 'created_time', direction: 'descending' });
    const [currentPage, setCurrentPage] = useState(1);
    const [showSortDialog, setShowSortDialog] = useState(false);
    const [sortField, setSortField] = useState('created_time');
    const [sortOrder, setSortOrder] = useState('descending');
    const campaignsPerPage = 10;
    
    const STATUSES = ['', 'ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'];


    // Check authentication status on component mount and URL changes
    const checkAuthStatus = useCallback(async () => {
        try {
            const params = new URLSearchParams(window.location.search);
            
            // Handle OAuth callback
            if (params.get('authSuccess')) {
                setAuthStatus('AUTHENTICATED');
                setIsAuthenticated(true);
                window.history.replaceState({}, document.title, window.location.pathname);
                return;
            } else if (params.get('authError')) {
                setAuthStatus('ERROR');
                setApiError('Authentication failed: ' + params.get('authError'));
                window.history.replaceState({}, document.title, window.location.pathname);
                return;
            }

            // Check current session status
            const response = await axios.get(`${BACKEND_URL}/auth/status`);
            
            if (response.data.authenticated) {
                setAuthStatus('AUTHENTICATED');
                setIsAuthenticated(true);
            } else {
                setAuthStatus('LOGGED_OUT');
                setIsAuthenticated(false);
            }
        } catch (error) {
            console.error('Error checking auth status:', error);
            setAuthStatus('ERROR');
            setApiError('Failed to check authentication status');
        }
    }, []);

    // Initial auth check on mount
    useEffect(() => {
        checkAuthStatus();
    }, [checkAuthStatus]);

    const fetchCampaigns = useCallback(async (id) => {
        // Ensure we have a valid string ID
        const currentId = typeof id === 'string' ? id.trim() : 
                         (typeof advertiserId === 'string' ? advertiserId.trim() : '');
        
        if (!currentId) {
            const errorMsg = !currentId ? 'Please enter a valid advertiser ID' : 'Advertiser ID is required';
            setApiError(errorMsg);
            return;
        }

        // Re-check auth status before making the request
        try {
            const authResponse = await axios.get(`${BACKEND_URL}/auth/status`);
            if (!authResponse.data.authenticated) {
                setAuthStatus('LOGGED_OUT');
                setIsAuthenticated(false);
                setApiError('Your session has expired. Please log in again.');
                return;
            }
        } catch (error) {
            console.error('Error verifying authentication:', error);
            setApiError('Failed to verify authentication status');
            return;
        }
  
  setLoading(true);
  setApiError(null);

  try {
    const response = await axios.get(`${BACKEND_URL}/api/campaigns`, {
      params: {
        advertiser_id: currentId,
        page_size: 100,
      },
    });
    // console.log("this is the response in frontend"+response);
    const rawData = response.data.campaigns || [];
    // console.log("this is the response in frontend"+rawData);
    
    const transformedData = rawData.map(campaign => ({
    id: campaign.id,
    campaign_name: campaign.name,
    objective: campaign.objective || 'N/A',
    campaign_status: campaign.status || 'N/A',
    budget: campaign.daily_budget
        ? (parseFloat(campaign.daily_budget) / 100).toFixed(2)
        : 'N/A',
    created_time: campaign.created_time
        ? new Date(campaign.created_time)
        : new Date(0),
    }));
    
    // console.log("this is the response"+transformedData);
    setAllCampaigns(transformedData);
    setCurrentPage(1);
    setLoading(false);
  } catch (err) {
    console.error(err);
    setApiError(
      err.response?.data?.details?.error_user_title ||
      err.response?.data?.error ||
      'Could not fetch campaigns from proxy.'
    );
    setLoading(false);
    setAllCampaigns([]);
  }
}, [authStatus]);


    useEffect(() => {
        if (authStatus === 'AUTHENTICATED') {
            setIsAuthenticated(true);
        } else {
            setIsAuthenticated(false);
        }
    }, [authStatus]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, statusFilter, sortConfig]);

    const filteredCampaigns = useMemo(() => {
        const searchLower = searchTerm.toLowerCase();
        return allCampaigns.filter(campaign => {
            // Apply status filter if set
            if (statusFilter && campaign.campaign_status !== statusFilter) {
                return false;
            }
            
            // If no search term, return all that match status filter
            if (!searchLower) return true;
            
            // Check search term against all searchable fields
            return (
                (campaign.campaign_name && campaign.campaign_name.toLowerCase().includes(searchLower)) ||
                (campaign.id && campaign.id.toString().toLowerCase().includes(searchLower)) ||
                (campaign.objective && campaign.objective.toLowerCase().includes(searchLower)) ||
                (campaign.campaign_status && campaign.campaign_status.toLowerCase().includes(searchLower))
            );
        });
    }, [allCampaigns, searchTerm, statusFilter]);

    // 2. Sorting
    const sortedCampaigns = useMemo(() => {
        if (!filteredCampaigns.length) return [];
        
        let sortableItems = [...filteredCampaigns];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                let aValue = a[sortConfig.key];
                let bValue = b[sortConfig.key];
                
                // Handle date sorting
                if (sortConfig.key === 'created_time' && aValue instanceof Date && bValue instanceof Date) {
                    return sortConfig.direction === 'ascending' 
                        ? aValue - bValue 
                        : bValue - aValue;
                }
                
                // Handle numeric values (like budget)
                if (sortConfig.key === 'budget' && aValue !== 'N/A' && bValue !== 'N/A') {
                    aValue = parseFloat(aValue);
                    bValue = parseFloat(bValue);
                    return sortConfig.direction === 'ascending' 
                        ? aValue - bValue 
                        : bValue - aValue;
                }
                
                // Handle string values
                aValue = String(aValue || '').toLowerCase();
                bValue = String(bValue || '').toLowerCase();
                
                if (aValue < bValue) {
                    return sortConfig.direction === 'ascending' ? -1 : 1;
                }
                if (aValue > bValue) {
                    return sortConfig.direction === 'ascending' ? 1 : -1;
                }
                return 0;
            });
        }
        return sortableItems;
    }, [filteredCampaigns, sortConfig]);

    const applySort = () => {
        setSortConfig({ key: sortField, direction: sortOrder });
        setShowSortDialog(false);
    };

    const openSortDialog = () => {
        setSortField(sortConfig.key);
        setSortOrder(sortConfig.direction);
        setShowSortDialog(true);
    };

    // 3. Pagination
    const totalPages = Math.ceil(sortedCampaigns.length / campaignsPerPage) || 1;
    const currentCampaigns = useMemo(() => {
        const startIndex = (currentPage - 1) * campaignsPerPage;
        return sortedCampaigns.slice(startIndex, startIndex + campaignsPerPage);
    }, [sortedCampaigns, currentPage, campaignsPerPage]);


    // --- Rendering Functions ---
    
    const renderTableBody = () => {
        if (loading) {
            return <tr><td colSpan="6" style={{textAlign: 'center'}}>Loading campaign data...</td></tr>;
        }

        if (apiError) {
            return <tr><td colSpan="6" style={{color: 'red', textAlign: 'center'}}>🚨 API Error: {apiError}</td></tr>;
        }

        if (isAuthenticated && allCampaigns.length === 0 && !loading) {
            // Show empty state with message
            return (
                <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '40px' }}>
                        {apiError ? (
                            <p style={{ color: '#d32f2f' }}>{apiError}</p>
                        ) : (
                            <p>No campaigns found. Please enter an advertiser ID and click Load Campaigns.</p>
                        )}
                    </td>
                </tr>
            );
        }

        if (authStatus === 'CHECKING') {
            return (
                <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '50px' }}>
                        <div>Checking authentication status...</div>
                    </td>
                </tr>
            );
        }
        
        if (authStatus === 'LOGGED_OUT') {
            return (
                <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: '50px' }}>
                        <a href={`${BACKEND_URL}/auth/meta`}>
                            <button style={styles.loginButton}>
                                🚀 Connect to Meta Marketing API
                            </button>
                        </a>
                    </td>
                </tr>
            );
        }

        if (currentCampaigns.length === 0 && allCampaigns.length > 0) {
            // This case means no results after search/filter
            return <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>No campaigns match the current search criteria.</td></tr>;
        }

        if (currentCampaigns.length === 0 && authStatus === 'AUTHENTICATED') {
            // Empty state (no data returned from API)
            return <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>No campaign data found for advertiser ID <strong>{advertiserId}</strong>.</td></tr>;
        }

        return currentCampaigns.map((campaign) => (
            <tr key={campaign.id}>
                <td>{campaign.id}</td>
                <td>{campaign.campaign_name}</td>
                <td>{campaign.objective}</td>
                <td><span style={styles.statusBadge(campaign.campaign_status)}>{campaign.campaign_status}</span></td>
                <td>{campaign.budget === 'N/A' ? 'N/A' : `$${campaign.budget.toFixed(2)}`}</td>
                <td>{campaign.created_time.toLocaleDateString()}</td>
            </tr>
        ));
    };
    
    const tableHeaders = [
        { key: 'id', label: 'ID' },
        { key: 'campaign_name', label: 'Name' },
        { key: 'objective', label: 'Objective' },
        { key: 'campaign_status', label: 'Status' },
        { key: 'budget', label: 'Budget' },
        { key: 'created_time', label: 'Created Time' },
    ];


    return (
        <div style={styles.container}>
            <h1 style={styles.header}>Meta Campaign Dashboard</h1>
            
            {!isAuthenticated ? null : (
                <>
                    <div style={styles.advertiserInputContainer}>
                        <input
                            type="text"
                            placeholder="Enter Advertiser ID"
                            value={advertiserId}
                            onChange={(e) => {
                              console.log('Input changed:', e.target.value);
                              setAdvertiserId(e.target.value);
                            }}
                            onKeyPress={(e) => e.key === 'Enter' && advertiserId && advertiserId.trim() && fetchCampaigns(advertiserId.trim())}
                            style={styles.advertiserInput}
                            disabled={loading}
                        />
                        <button 
                            onClick={() => {
                              console.log('Load Campaigns clicked');
                              console.log('Current state - advertiserId:', advertiserId);
                              fetchCampaigns(advertiserId);
                            }}
                            style={styles.loadButton}
                            disabled={loading || !advertiserId || !advertiserId.trim()}
                        >
                            {loading ? 'Loading...' : 'Load Campaigns'}
                        </button>
                    </div>
                    {allCampaigns.length > 0 && (
                        <p style={styles.subHeader}>
                            Showing {allCampaigns.length} campaigns for advertiser: <strong>{advertiserId}</strong>
                        </p>
                    )}
                </>
            )}

            {/* Controls Section (Only shown when authenticated) */}
            {authStatus === 'AUTHENTICATED' && (
                <div style={styles.controls}>
                    {/* Search Input */}
                    <input
                        type="text"
                        placeholder="Search by Campaign ID or Name..."
                        value={searchTerm}
                        onChange={(e) => {
                            setSearchTerm(e.target.value);
                            setCurrentPage(1); 
                        }}
                        style={styles.searchInput}
                    />

                    {/* Status Filter (Nice-to-Have) */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={styles.selectInput}
                        disabled={loading}
                    >
                        <option value="">All Statuses</option>
                        {STATUSES.filter(s => s).map(status => (
                            <option key={status} value={status}>{status}</option>
                        ))}
                    </select>

                    {/* Refresh Button */}
                    <button onClick={fetchCampaigns} disabled={loading} style={styles.refreshButton}>
                        {loading ? 'Refreshing...' : 'Refresh Data'}
                    </button>
                    
                    {/* Sort Button */}
                    <button 
                        onClick={openSortDialog}
                        style={styles.sortButton}
                        disabled={loading}
                    >
                        Sort
                    </button>
                </div>
            )}

            {/* Campaign Table */}
            <table style={styles.table}>
                <thead>
                    <tr>
                        {tableHeaders.map(({ key, label }) => (
                            <th 
                                key={key}
                                style={styles.th}
                            >
                                {label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {renderTableBody()}
                </tbody>
            </table>

            {/* Sort Dialog */}
            {showSortDialog && (
                <div style={styles.sortDialog}>
                    <div style={styles.sortDialogContent}>
                        <h3 style={{marginTop: 0}}>Sort Campaigns</h3>
                        <div style={styles.sortOption}>
                            <label>Sort by:</label>
                            <select 
                                value={sortField}
                                onChange={(e) => setSortField(e.target.value)}
                                style={styles.sortSelect}
                            >
                                <option value="id">ID</option>
                                <option value="campaign_name">Name</option>
                                <option value="objective">Objective</option>
                                <option value="campaign_status">Status</option>
                                <option value="budget">Budget</option>
                                <option value="created_time">Created Time</option>
                            </select>
                        </div>
                        <div style={styles.sortOption}>
                            <label>Order:</label>
                            <select 
                                value={sortOrder}
                                onChange={(e) => setSortOrder(e.target.value)}
                                style={styles.sortSelect}
                            >
                                <option value="ascending">Ascending (A-Z, 0-9, Old-New)</option>
                                <option value="descending">Descending (Z-A, 9-0, New-Old)</option>
                            </select>
                        </div>
                        <div style={styles.sortButtons}>
                            <button 
                                onClick={() => setShowSortDialog(false)}
                                style={styles.cancelButton}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={applySort}
                                style={styles.applyButton}
                            >
                                Apply Sort
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Pagination Controls */}
            {(authStatus === 'AUTHENTICATED' && sortedCampaigns.length > 0) && (
                <div style={styles.paginationContainer}>
                    <div style={styles.paginationInfo}>
                        Showing {Math.min((currentPage - 1) * campaignsPerPage + 1, sortedCampaigns.length)}-
                        {Math.min(currentPage * campaignsPerPage, sortedCampaigns.length)} of {sortedCampaigns.length} campaigns
                    </div>
                    <div style={styles.paginationControls}>
                        <button 
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} 
                            disabled={currentPage === 1 || loading}
                            style={styles.paginationButton}
                        >
                            &larr; Previous
                        </button>
                        <span style={styles.pageInfo}>
                            Page {currentPage} of {totalPages}
                        </span>
                        <button 
                            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} 
                            disabled={currentPage === totalPages || loading}
                            style={styles.paginationButton}
                        >
                            Next &rarr;
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

// Basic Inline Styles
const styles = {
    advertiserInputContainer: {
        display: 'flex',
        gap: '10px',
        margin: '10px 0',
        alignItems: 'center',
    },
    advertiserInput: {
        padding: '8px 12px',
        borderRadius: '4px',
        border: '1px solid #ccc',
        fontSize: '14px',
        minWidth: '300px',
    },
    loadButton: {
        padding: '8px 16px',
        backgroundColor: '#4267B2',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
    },
    loadButton: {
        '&:disabled': {
            backgroundColor: '#a8c1e8',
            cursor: 'not-allowed',
        },
    },
    authContainer: {
        textAlign: 'center',
        margin: '20px 0',
    },
    authMessage: {
        marginBottom: '15px',
        fontSize: '16px',
        color: '#555',
    },
    sortButton: {
        padding: '10px 15px',
        backgroundColor: '#f0f0f0',
        border: '1px solid #ddd',
        borderRadius: '4px',
        cursor: 'pointer',
        marginLeft: '10px',
        ':hover': {
            backgroundColor: '#e0e0e0'
        },
        ':disabled': {
            opacity: 0.6,
            cursor: 'not-allowed'
        }
    },
    sortDialog: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 1000
    },
    sortDialogContent: {
        backgroundColor: 'white',
        padding: '20px',
        borderRadius: '8px',
        width: '400px',
        maxWidth: '90%',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
    },
    sortOption: {
        margin: '15px 0'
    },
    sortSelect: {
        width: '100%',
        padding: '8px',
        marginTop: '5px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        fontSize: '14px'
    },
    sortButtons: {
        display: 'flex',
        justifyContent: 'flex-end',
        marginTop: '20px',
        gap: '10px'
    },
    applyButton: {
        padding: '8px 16px',
        backgroundColor: '#4CAF50',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        ':hover': {
            backgroundColor: '#45a049'
        }
    },
    cancelButton: {
        padding: '8px 16px',
        backgroundColor: '#f0f0f0',
        border: '1px solid #ddd',
        borderRadius: '4px',
        cursor: 'pointer',
        ':hover': {
            backgroundColor: '#e0e0e0'
        }
    },
    paginationContainer: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: '20px',
        padding: '10px 0',
        borderTop: '1px solid #eee'
    },
    paginationInfo: {
        color: '#666',
        fontSize: '14px'
    },
    pageInfo: {
        margin: '0 15px'
    },
    paginationButton: {
        padding: '8px 16px',
        margin: '0 5px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        backgroundColor: '#fff',
        cursor: 'pointer',
        ':disabled': {
            cursor: 'not-allowed',
            opacity: 0.6
        },
        ':not(:disabled):hover': {
            backgroundColor: '#f5f5f5'
        }
    },
    container: { padding: '20px', fontFamily: 'Segoe UI, Arial, sans-serif', maxWidth: '1200px', margin: 'auto' },
    header: { color: '#3b5998', borderBottom: '2px solid #3b5998', paddingBottom: '10px' },
    subHeader: { color: '#555', marginBottom: '20px' },
    controls: { marginBottom: '20px', display: 'flex', gap: '15px', alignItems: 'center' },
    searchInput: { padding: '10px', width: '300px', border: '1px solid #ddd', borderRadius: '4px' },
    selectInput: { padding: '10px', border: '1px solid #ddd', borderRadius: '4px' },
    refreshButton: { padding: '10px 15px', cursor: 'pointer', backgroundColor: '#4CAF50', color: 'white', border: 'none', borderRadius: '4px' },
    table: { width: '100%', borderCollapse: 'collapse', textAlign: 'left', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' },
    th: { borderBottom: '3px solid #f0f0f0', padding: '12px 10px', cursor: 'pointer', color: '#333' },
    loginButton: { padding: '12px 25px', cursor: 'pointer', backgroundColor: '#3b5998', color: 'white', border: 'none', borderRadius: '6px', fontSize: '16px' },
    paginationControls: { marginTop: '20px', display: 'flex', justifyContent: 'center', alignItems: 'center' },
    paginationButton: { padding: '8px 15px', margin: '0 8px', cursor: 'pointer', backgroundColor: '#f0f0f0', border: '1px solid #ddd', borderRadius: '4px' },
    statusBadge: (status) => {
        let color = '#777';
        switch (status) {
            case 'ACTIVE': color = '#4CAF50'; break;
            case 'PAUSED': color = '#FFC107'; break;
            case 'DELETED': color = '#F44336'; break;
            default: color = '#2196F3'; 
        }
        return { 
            display: 'inline-block', 
            padding: '4px 8px', 
            borderRadius: '12px', 
            fontSize: '12px', 
            fontWeight: 'bold', 
            color: 'white',
            backgroundColor: color 
        };
    }
};

export default CampaignsTable;

// Note: In a standard CRA/Vite setup, you would update src/App.js to render this component:
/*
// src/App.js
import CampaignsTable from './CampaignsTable';
function App() {
  return (
    <CampaignsTable />
  );
}
export default App;
*/