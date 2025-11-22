import React, { useState, useEffect } from 'react';
import { TrendingDown, TrendingUp, AlertCircle, Activity, Filter } from 'lucide-react';
import PatientDetailModal from '../components/PatientDetailModal';

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
  _priority_score?: number;
  _hours_waiting?: number;
  timestamp?: string;
  examined?: boolean;
  examined_at?: string;
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
  const [filteredPredictions, setFilteredPredictions] = useState<Prediction[]>([]);
  const [selectedPrediction, setSelectedPrediction] = useState<Prediction | null>(null);
  const [showModal, setShowModal] = useState(false);

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
      params.append('limit', '100');

      const response = await fetch(`/api/priority/statistics?${params}`);
      const data = await response.json();
      setStatistics(data);
      
      // Nếu đang có filter severity, load lại data cho severity đó
      if (selectedSeverity !== null) {
        await fetchBySeverity(selectedSeverity);
      } else {
        setFilteredPredictions(data.predictions);
      }
    } catch (error) {
      console.error('Error fetching statistics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBySeverity = async (severityLevel: number) => {
    try {
      const response = await fetch(`/api/priority/by-severity?severity_level=${severityLevel}&limit=200`);
      const data = await response.json();
      setFilteredPredictions(data.results || []);
    } catch (error) {
      console.error('Error fetching by severity:', error);
      setFilteredPredictions([]);
    }
  };

  const handleSeverityClick = async (severityLevel: number) => {
    if (selectedSeverity === severityLevel) {
      // Nếu đang chọn rồi thì bỏ chọn
      setSelectedSeverity(null);
      setFilteredPredictions(statistics?.predictions || []);
    } else {
      // Chọn severity mới
      setSelectedSeverity(severityLevel);
      setLoading(true);
      await fetchBySeverity(severityLevel);
      setLoading(false);
    }
  };

  useEffect(()=> {
      document.title = "Priority Management - X-Ray System";
    }, []);
  useEffect(() => {
    fetchStatistics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, sortOrder]);

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

  const handleExaminedChange = async (predictionId: string, examined: boolean) => {
    try {
      const response = await fetch('/api/priority/mark-examined', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prediction_id: predictionId,
          examined: examined,
        }),
      });

      if (response.ok) {
        // Cập nhật state local
        setFilteredPredictions(prev =>
          prev.map(p =>
            p._id === predictionId
              ? { ...p, examined: examined, examined_at: examined ? new Date().toISOString() : undefined }
              : p
          )
        );
      } else {
        console.error('Failed to update examined status');
        // Revert checkbox nếu API fail
        const checkbox = document.getElementById(`examined-${predictionId}`) as HTMLInputElement;
        if (checkbox) checkbox.checked = !examined;
      }
    } catch (error) {
      console.error('Error updating examined status:', error);
      // Revert checkbox
      const checkbox = document.getElementById(`examined-${predictionId}`) as HTMLInputElement;
      if (checkbox) checkbox.checked = !examined;
    }
  };

  const handleRowClick = (prediction: Prediction, event: React.MouseEvent) => {
    // Không mở modal nếu click vào checkbox
    if ((event.target as HTMLElement).closest('input[type="checkbox"]')) {
      return;
    }
    setSelectedPrediction(prediction);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedPrediction(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 py-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Thống kê theo mức độ ưu tiên</h1>
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
            onClick={() => handleSeverityClick(item.severity_level)}
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
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Đã khám
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Điểm ưu tiên
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
                  Thời gian chờ
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPredictions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    Không có dữ liệu
                  </td>
                </tr>
              ) : (
                filteredPredictions.map((prediction, index) => (
                  <tr 
                    key={prediction._id} 
                    onClick={(e) => handleRowClick(prediction, e)}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${prediction.examined ? 'bg-green-50 opacity-60' : ''}`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {index + 1}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      <input
                        id={`examined-${prediction._id}`}
                        type="checkbox"
                        checked={prediction.examined || false}
                        onChange={(e) => handleExaminedChange(prediction._id, e.target.checked)}
                        className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500 cursor-pointer"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-lg font-bold text-blue-600">
                        {prediction._priority_score?.toFixed(1) || '0.0'}
                      </div>
                      <div className="text-xs text-gray-500">
                        điểm
                      </div>
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {prediction._hours_waiting ? `${prediction._hours_waiting.toFixed(1)} giờ` : 'N/A'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {formatDate(prediction.timestamp)}
                      </div>
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

      {/* Modal Chi tiết Bệnh nhân */}
      <PatientDetailModal
        prediction={selectedPrediction}
        isOpen={showModal}
        onClose={closeModal}
        onExaminedChange={handleExaminedChange}
        showExaminedButton={true}
      />
    </div>
  );
};

export default PriorityPage;
