
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';

const BACKEND_URL = 'http://localhost:5000';
const DEFAULT_ADVERTISER_ID = 'act_799592772874590'; 

const CampaignsTable = () => {
    const [allCampaigns, setAllCampaigns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [authStatus, setAuthStatus] = useState('LOGGED_OUT'); // LOGGED_OUT, AUTHENTICATED, ERROR
    const [apiError, setApiError] = useState(null);

    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState(''); // Nice-to-Have filter
    const [sortConfig, setSortConfig] = useState({ key: 'created_time', direction: 'descending' });
    const [currentPage, setCurrentPage] = useState(1);
    const campaignsPerPage = 10;
    
    const STATUSES = ['', 'ACTIVE', 'PAUSED', 'DELETED', 'ARCHIVED'];


    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('authSuccess')) {
            setAuthStatus('AUTHENTICATED');
            window.history.replaceState(null, null, window.location.pathname);
        } else if (params.get('authError')) {
            setAuthStatus('ERROR');
            setApiError('Authentication failed: ' + params.get('authError'));
            window.history.replaceState(null, null, window.location.pathname);
        }
    }, []);

    const fetchCampaigns = useCallback(async () => {
  if (authStatus !== 'AUTHENTICATED') return;
  setLoading(true);
  setApiError(null);

  try {
    const response = await axios.get(`${BACKEND_URL}/api/campaigns`, {
      params: {
        advertiser_id: DEFAULT_ADVERTISER_ID,
        page_size: 100,
        // status: statusFilter,
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
}, [authStatus, statusFilter]);


    useEffect(() => {
        if (authStatus === 'AUTHENTICATED') {
            fetchCampaigns();
        }
    }, [authStatus, statusFilter, fetchCampaigns]);

    const filteredCampaigns = useMemo(() => {
        return allCampaigns.filter(campaign =>
            campaign.campaign_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            campaign.campaign_id.toString().includes(searchTerm)
        );
    }, [allCampaigns, searchTerm]);

    // 2. Sorting
    const sortedCampaigns = useMemo(() => {
        let sortableItems = [...filteredCampaigns];
        if (sortConfig.key) {
            sortableItems.sort((a, b) => {
                const aValue = a[sortConfig.key];
                const bValue = b[sortConfig.key];
                
                // Handle mixed types (like budget 'N/A' vs number)
                const aIsNA = aValue === 'N/A';
                const bIsNA = bValue === 'N/A';

                if (aIsNA && bIsNA) return 0;
                if (aIsNA) return sortConfig.direction === 'ascending' ? 1 : -1; // Push N/A to the bottom
                if (bIsNA) return sortConfig.direction === 'ascending' ? -1 : 1;

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

    const requestSort = (key) => {
        let direction = 'ascending';
        if (sortConfig.key === key && sortConfig.direction === 'ascending') {
            direction = 'descending';
        }
        setSortConfig({ key, direction });
    };

    // 3. Pagination
    const totalPages = Math.ceil(sortedCampaigns.length / campaignsPerPage);
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
            return <tr><td colSpan="6" style={{ textAlign: 'center', padding: '20px' }}>No campaign data found for advertiser ID **{DEFAULT_ADVERTISER_ID}**.</td></tr>;
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
            <p style={styles.subHeader}>
                Advertiser: <strong>{DEFAULT_ADVERTISER_ID}</strong> 
                {authStatus === 'AUTHENTICATED' && ` (${allCampaigns.length} total campaigns loaded)`}
            </p>

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
                </div>
            )}

            {/* Campaign Table */}
            <table style={styles.table}>
                <thead>
                    <tr>
                        {tableHeaders.map(({ key, label }) => (
                            <th 
                                key={key}
                                onClick={() => requestSort(key)} 
                                style={{ ...styles.th, backgroundColor: sortConfig.key === key ? '#e0f7fa' : 'white' }}
                            >
                                {label}
                                {/* Sort Indicator */}
                                {sortConfig.key === key && (
                                    <span>{sortConfig.direction === 'ascending' ? ' ▲' : ' ▼'}</span>
                                )}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {renderTableBody()}
                </tbody>
            </table>

            {/* Pagination Controls */}
            {(authStatus === 'AUTHENTICATED' && sortedCampaigns.length > campaignsPerPage) && (
                <div style={styles.paginationControls}>
                    <button 
                        onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} 
                        disabled={currentPage === 1}
                        style={styles.paginationButton}
                    >
                        &larr; Previous
                    </button>
                    <span style={{ margin: '0 15px' }}>Page **{currentPage}** of **{totalPages}**</span>
                    <button 
                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} 
                        disabled={currentPage === totalPages}
                        style={styles.paginationButton}
                    >
                        Next &rarr;
                    </button>
                </div>
            )}
        </div>
    );
};

// Basic Inline Styles
const styles = {
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