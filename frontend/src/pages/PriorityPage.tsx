import React, { useState, useEffect } from 'react';
import { Calendar, TrendingDown, TrendingUp, AlertCircle, Activity, Filter } from 'lucide-react';

interface Prediction {
  _id: string;
  'Image Index': string;
  'Patient ID': string;
  'Patient Name'?: string;
  'Patient Age'?: number;
  'Patient Sex'?: string;
  _parsed_severity: number;
  _parsed_disease: string;
  _parsed_probability: number;
  timestamp?: string;
}

interface SeveritySummary {
  severity_level: number;
  severity_name: string;
  count: number;
}

interface StatisticsData {
  summary: SeveritySummary[];
  total: number;
  predictions: Prediction[];
  filter_info: {
    start_date: string | null;
    end_date: string | null;
    sort_order: string;
  };
}

const PriorityPage: React.FC = () => {
  const [statistics, setStatistics] = useState<StatisticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [selectedSeverity, setSelectedSeverity] = useState<number | null>(null);

  const severityColors = {
    0: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' },
    1: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
    2: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
    3: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
    4: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  };

  const fetchStatistics = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('start_date', startDate);
      if (endDate) params.append('end_date', endDate);
      params.append('sort_order', sortOrder);

      const response = await fetch(`/api/priority/statistics?${params}`);
      const data = await response.json();
      setStatistics(data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatistics();
  }, []);

  const handleFilter = () => {
    fetchStatistics();
  };

  const handleReset = () => {
    setStartDate('');
    setEndDate('');
    setSortOrder('desc');
    setSelectedSeverity(null);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('vi-VN');
  };

  const formatProbability = (prob: number) => {
    return (prob * 100).toFixed(1) + '%';
  };

  const filteredPredictions = selectedSeverity !== null
    ? statistics?.predictions.filter(p => p._parsed_severity === selectedSeverity) || []
    : statistics?.predictions || [];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Thống kê theo mức độ ưu tiên</h1>
          <p className="text-gray-500 mt-1">Phân loại và quản lý ca bệnh theo mức độ nghiêm trọng</p>
        </div>
        <Activity className="w-8 h-8 text-blue-500" />
      </div>

      {/* Filter Section */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-2 mb-4">
          <Filter className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-800">Bộ lọc</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Từ ngày
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Đến ngày
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sắp xếp
            </label>
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as 'asc' | 'desc')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="desc">Cao đến thấp</option>
              <option value="asc">Thấp đến cao</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={handleFilter}
              className="flex-1 bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
            >
              Áp dụng
            </button>
            <button
              onClick={handleReset}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        {statistics?.summary.map((item) => (
          <div
            key={item.severity_level}
            onClick={() => setSelectedSeverity(
              selectedSeverity === item.severity_level ? null : item.severity_level
            )}
            className={`
              ${severityColors[item.severity_level as keyof typeof severityColors].bg}
              ${severityColors[item.severity_level as keyof typeof severityColors].border}
              border-2 rounded-lg p-4 cursor-pointer transition-all
              ${selectedSeverity === item.severity_level ? 'ring-4 ring-blue-300 scale-105' : 'hover:scale-102'}
            `}
          >
            <div className="flex items-center justify-between mb-2">
              <span className={`text-sm font-medium ${severityColors[item.severity_level as keyof typeof severityColors].text}`}>
                {item.severity_name}
              </span>
              <AlertCircle className={`w-4 h-4 ${severityColors[item.severity_level as keyof typeof severityColors].text}`} />
            </div>
            <div className={`text-2xl font-bold ${severityColors[item.severity_level as keyof typeof severityColors].text}`}>
              {item.count}
            </div>
            <div className="text-xs text-gray-600 mt-1">
              {statistics.total > 0 ? ((item.count / statistics.total) * 100).toFixed(1) : 0}%
            </div>
          </div>
        ))}
      </div>

      {/* Current Filter Info */}
      {(startDate || endDate || selectedSeverity !== null) && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center gap-2 text-sm text-blue-800">
            <Filter className="w-4 h-4" />
            <span className="font-medium">Đang lọc:</span>
            {startDate && <span>Từ {startDate}</span>}
            {endDate && <span>Đến {endDate}</span>}
            {selectedSeverity !== null && (
              <span className="bg-blue-200 px-2 py-1 rounded">
                Mức độ: {statistics?.summary.find(s => s.severity_level === selectedSeverity)?.severity_name}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Predictions Table */}
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-800">
              Danh sách ca bệnh ({filteredPredictions.length})
            </h2>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              {sortOrder === 'desc' ? (
                <>
                  <TrendingDown className="w-4 h-4" />
                  <span>Cao → Thấp</span>
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4" />
                  <span>Thấp → Cao</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  STT
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bệnh nhân
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Bệnh lý
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Xác suất
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Mức độ
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Thời gian
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPredictions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                    Không có dữ liệu
                  </td>
                </tr>
              ) : (
                filteredPredictions.map((prediction, index) => (
                  <tr key={prediction._id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {prediction['Patient Name'] || prediction['Patient ID']}
                      </div>
                      <div className="text-sm text-gray-500">
                        {prediction['Patient Age'] && `${prediction['Patient Age']} tuổi`}
                        {prediction['Patient Sex'] && ` • ${prediction['Patient Sex']}`}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {prediction._parsed_disease}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 font-medium">
                        {formatProbability(prediction._parsed_probability)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`
                          px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full
                          ${severityColors[prediction._parsed_severity as keyof typeof severityColors].bg}
                          ${severityColors[prediction._parsed_severity as keyof typeof severityColors].text}
                        `}
                      >
                        {statistics?.summary.find(s => s.severity_level === prediction._parsed_severity)?.severity_name}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(prediction.timestamp)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Statistics Info */}
      {statistics && (
        <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
          <div className="flex items-center gap-4">
            <span>Tổng số ca: <strong>{statistics.total}</strong></span>
            <span>•</span>
            <span>Đang hiển thị: <strong>{filteredPredictions.length}</strong></span>
            {statistics.filter_info.start_date && (
              <>
                <span>•</span>
                <span>Từ: {new Date(statistics.filter_info.start_date).toLocaleDateString('vi-VN')}</span>
              </>
            )}
            {statistics.filter_info.end_date && (
              <>
                <span>•</span>
                <span>Đến: {new Date(statistics.filter_info.end_date).toLocaleDateString('vi-VN')}</span>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PriorityPage;
