import React, { useState, useEffect, useRef } from 'react';
import { BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis } from 'recharts';

interface Stats {
  total_predictions: number;
  by_severity: { [key: string]: number };
  by_disease: { [key: string]: number };
  recent_count: number;
  severity_by_disease?: { [disease: string]: { [severity: string]: number } };
  hourly_trends?: Array<{ hour: string; count: number; avg_severity: number }>;
  by_gender?: { [gender: string]: number };
  by_age_group?: { [ageGroup: string]: number };
  age_disease_correlation?: { [disease: string]: { [ageGroup: string]: number } };
}

const COLORS = ['#10b981', '#84cc16', '#eab308', '#f97316', '#ef4444'];
const SEVERITY_NAMES = ['Bình thường', 'Nhẹ', 'Trung bình', 'Nghiêm trọng', 'Rất nghiêm trọng'];

export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    connectWebSocket();

    document.title = "Dashboard - X-Ray System";
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const connectWebSocket = () => {
    try {
      // Get WebSocket URL - use localhost:8000 for local dev, otherwise use current host
      const isDevelopment = process.env.NODE_ENV === 'development' && window.location.port === '3000';
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = isDevelopment ? 'localhost:8000' : window.location.host;
      const wsUrl = `${wsProtocol}//${wsHost}/api/ws/stats`;
      
      console.log('Connecting to WebSocket:', wsUrl);
      const ws = new WebSocket(wsUrl);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setWsConnected(true);
        setLoading(false);
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'stats_update' && message.data) {
            setStats(message.data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setWsConnected(false);
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setWsConnected(false);
        
        // Auto reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('Attempting to reconnect...');
          connectWebSocket();
        }, 5000);
      };
      
      wsRef.current = ws;
    } catch (error) {
      console.error('Error connecting WebSocket:', error);
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <svg className="animate-spin h-12 w-12 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-gray-600">Đang tải dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-red-50 border border-red-200 text-red-700 px-6 py-4 rounded-lg">
          Không thể tải dữ liệu thống kê
        </div>
      </div>
    );
  }

  // Prepare data for charts
  const severityData = Object.entries(stats.by_severity || {}).map(([level, count]) => ({
    name: SEVERITY_NAMES[parseInt(level)] || `Level ${level}`,
    value: count,
    level: parseInt(level)
  }));

  const diseaseData = Object.entries(stats.by_disease || {})
    .filter(([disease]) => disease !== "No Finding") // ← bỏ No Finding
    .map(([disease, count]) => ({ name: disease, value: count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 10);

  // Prepare radar chart data for severity analysis
  const radarData = severityData.map(item => ({
    severity: item.name,
    count: item.value,
    percentage: stats.total_predictions > 0 ? (item.value / stats.total_predictions * 100).toFixed(1) : 0
  }));

  // Prepare disease-severity matrix for top 6 diseases
  const top6Diseases = Object.entries(stats.by_disease || {})
    .filter(([disease]) => disease !== "No Finding")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([disease]) => disease);
  
  const diseaseSeverityData = top6Diseases.map(disease => {
    const severityDist = stats.severity_by_disease?.[disease] || {};
    return {
      disease: disease.length > 15 ? disease.substring(0, 15) + '...' : disease,
      fullDisease: disease,
      'Bình thường': severityDist['0'] || 0,
      'Nhẹ': severityDist['1'] || 0,
      'Trung bình': severityDist['2'] || 0,
      'Nghiêm trọng': severityDist['3'] || 0,
      'Rất nghiêm trọng': severityDist['4'] || 0,
    };
  });

  // Prepare gender distribution data
  const genderData = Object.entries(stats.by_gender || {})
    .filter(([gender]) => gender && gender !== 'Unknown')
    .map(([gender, count]) => ({
      name: gender === 'M' ? 'Nam' : gender === 'F' ? 'Nữ' : gender,
      value: count
    }));

  // Prepare age group data
  const ageGroupData = Object.entries(stats.by_age_group || {})
    .filter(([group]) => group !== 'Unknown')
    .map(([group, count]) => ({ name: group, value: count }))
    .sort((a, b) => {
      const order = ['0-20', '21-40', '41-60', '61-80', '80+'];
      return order.indexOf(a.name) - order.indexOf(b.name);
    });

  // Prepare age-disease correlation data for heatmap
  const top5DiseasesForAge = Object.entries(stats.by_disease || {})
    .filter(([disease]) => disease !== "No Finding")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([disease]) => disease);
    
  // Create heatmap data structure
  const heatmapData: { ageGroup: string; disease: string; fullDisease: string; value: number; x: number; y: number }[] = [];
  ['0-20', '21-40', '41-60', '61-80', '80+'].forEach((ageGroup, ageIndex) => {
    top5DiseasesForAge.forEach((disease, diseaseIndex) => {
      const diseaseData = stats.age_disease_correlation?.[disease] || {};
      const value = diseaseData[ageGroup] || 0;
      heatmapData.push({
        ageGroup,
        disease: disease.length > 12 ? disease.substring(0, 12) + '...' : disease,
        fullDisease: disease,
        value,
        x: ageIndex,
        y: diseaseIndex
      });
    });
  });


  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center">
            <div className="p-3 bg-blue-100 rounded-full">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">Tổng dự đoán</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total_predictions}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center">
            <div className="p-3 bg-green-100 rounded-full">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">Bình thường</p>
              <p className="text-2xl font-bold text-gray-900">{stats.by_severity?.[0] || 0}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center">
            <div className="p-3 bg-orange-100 rounded-full">
              <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">Nghiêm trọng</p>
              <p className="text-2xl font-bold text-gray-900">{(stats.by_severity?.[3] || 0) + (stats.by_severity?.[4] || 0)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center">
            <div className="p-3 bg-purple-100 rounded-full">
              <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div className="ml-4">
              <p className="text-sm text-gray-600">Loại bệnh</p>
              <p className="text-2xl font-bold text-gray-900">{Object.keys(stats.by_disease || {}).length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Severity Distribution */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Phân bố theo mức độ nghiêm trọng</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={severityData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(0)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {severityData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[entry.level]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Top Diseases */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Top 10 bệnh phổ biến</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={diseaseData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* New Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mt-8">
        {/* Severity Area Chart */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Phân tích mức độ nghiêm trọng (Tỷ lệ %)</h2>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={severityData}>
              <defs>
                <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.1}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
              />
              <Area type="monotone" dataKey="value" stroke="#3b82f6" fillOpacity={1} fill="url(#colorCount)" />
            </AreaChart>
          </ResponsiveContainer>
          <div className="mt-4 text-sm text-gray-600 text-center">
            Biểu đồ diện tích hiển thị xu hướng phân bố các mức độ nghiêm trọng
          </div>
        </div>

        {/* Disease-Severity Stacked Bar Chart */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Mức độ nghiêm trọng theo bệnh</h2>
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={diseaseSeverityData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="disease" type="category" width={120} tick={{ fontSize: 11 }} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                formatter={(value: any, name: string) => [value, name]}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="Bình thường" stackId="a" fill="#10b981" />
              <Bar dataKey="Nhẹ" stackId="a" fill="#84cc16" />
              <Bar dataKey="Trung bình" stackId="a" fill="#eab308" />
              <Bar dataKey="Nghiêm trọng" stackId="a" fill="#f97316" />
              <Bar dataKey="Rất nghiêm trọng" stackId="a" fill="#ef4444" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 text-sm text-gray-600 text-center">
            Biểu đồ xếp chồng cho thấy phân bố mức độ của từng bệnh
          </div>
        </div>
      </div>

      {/* Demographics Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mt-8">
        {/* Gender Distribution */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Phân bố theo giới tính</h2>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={genderData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, percent }) => `${name}: ${((percent || 0) * 100).toFixed(1)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {genderData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={index === 0 ? '#3b82f6' : '#ec4899'} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-4 text-sm text-gray-600 text-center">
            Tỷ lệ nam/nữ trong dữ liệu bệnh nhân
          </div>
        </div>

        {/* Age Distribution */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Phân bố theo độ tuổi</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={ageGroupData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-4 text-sm text-gray-600 text-center">
            Phân bố bệnh nhân theo nhóm tuổi
          </div>
        </div>

        {/* Age-Disease Correlation */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-bold text-gray-800 mb-4">Tương quan tuổi - bệnh</h2>
          <div className="heatmap-container" style={{ 
            width: '100%', 
            height: '400px',
            display: 'grid',
            gridTemplateColumns: `100px repeat(5, 1fr)`,
            gridTemplateRows: `40px repeat(${top5DiseasesForAge.length}, 1fr)`,
            gap: '2px',
            padding: '10px'
          }}>
            {/* Header row - Age groups */}
            <div></div>
            {['0-20', '21-40', '41-60', '61-80', '80+'].map(age => (
              <div key={age} style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                fontWeight: 'bold',
                color: '#4A5568',
                backgroundColor: '#F7FAFC',
                borderRadius: '6px'
              }}>
                {age}
              </div>
            ))}
            
            {/* Data rows */}
            {top5DiseasesForAge.map((disease, diseaseIndex) => (
              <>
                {/* Disease label */}
                <div key={`label-${disease}`} style={{
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: '#4A5568',
                  paddingRight: '8px',
                  textAlign: 'right',
                  backgroundColor: '#F7FAFC',
                  borderRadius: '6px',
                  justifyContent: 'center'
                }}>
                  {disease.length > 12 ? disease.substring(0, 12) + '...' : disease}
                </div>
                
                {/* Data cells */}
                {['0-20', '21-40', '41-60', '61-80', '80+'].map((ageGroup, ageIndex) => {
                  const diseaseData = stats.age_disease_correlation?.[disease] || {};
                  const value = diseaseData[ageGroup] || 0;
                  const maxValue = Math.max(...heatmapData.map(d => d.value));
                  const intensity = maxValue > 0 ? value / maxValue : 0;
                  
                  return (
                    <div key={`${disease}-${ageGroup}`} style={{
                      backgroundColor: `rgba(59, 130, 246, ${intensity * 0.8 + 0.1})`,
                      border: '2px solid #E2E8F0',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '13px',
                      fontWeight: 'bold',
                      color: intensity > 0.5 ? 'white' : '#1A202C',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    title={`${disease} (${ageGroup}): ${value} ca`}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'scale(1.05)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'scale(1)';
                    }}
                    >
                      {value}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
          <div className="mt-4 text-sm text-gray-600 text-center">
            Biểu đồ tương quan tuổi - bệnh (Top 5 bệnh)
          </div>
        </div>
      </div>

      {/* Connection Status & Refresh Button */}
      <div className="mt-8 text-center">
        <div className="mb-4 inline-flex items-center">
          <span className={`h-3 w-3 rounded-full mr-2 ${wsConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
          <span className="text-sm text-gray-600">
            {wsConnected ? 'Đang cập nhật tự động' : 'Mất kết nối - Đang thử kết nối lại...'}
          </span>
        </div>
      </div>
    </div>
  );
};
