import React, { useState, useEffect } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface PredictionData {
  disease: string;
  probability: number;
  severity_level: number;
  severity_name: string;
  description: string;
}

interface PredictionResult {
  _id: string;
  'Image Index': string;
  'Patient ID': string;
  'Patient Name'?: string;
  'Patient Age'?: number;
  'Patient Sex'?: string;
  hdfs_path: string;
  predicted_label: string;
  timestamp: string;
}

export const ResultsPage: React.FC = () => {
  const [searchName, setSearchName] = useState('');
  const [predictions, setPredictions] = useState<PredictionResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!searchName.trim()) return;

    setLoading(true);
    setSearched(true);
    try {
      const response = await fetch(`${API_BASE_URL}/search-by-name?name=${encodeURIComponent(searchName.trim())}`);
      if (response.ok) {
        const data = await response.json();
        setPredictions(data.results || []);
      } else {
        setPredictions([]);
      }
    } catch (error) {
      console.error('Error searching:', error);
      setPredictions([]);
    } finally {
      setLoading(false);
    }
  };

  const parsePrediction = (label: string): PredictionData | null => {
    try {
      return JSON.parse(label);
    } catch {
      return null;
    }
  };

  const getSeverityColor = (level: number): string => {
    const colors = {
      0: 'border-green-500 bg-green-50',
      1: 'border-lime-500 bg-lime-50',
      2: 'border-yellow-500 bg-yellow-50',
      3: 'border-orange-500 bg-orange-50',
      4: 'border-red-500 bg-red-50',
    };
    return colors[level as keyof typeof colors] || 'border-gray-500 bg-gray-50';
  };

  const getSeverityBadge = (level: number): string => {
    const badges = {
      0: 'bg-green-100 text-green-800',
      1: 'bg-lime-100 text-lime-800',
      2: 'bg-yellow-100 text-yellow-800',
      3: 'bg-orange-100 text-orange-800',
      4: 'bg-red-100 text-red-800',
    };
    return badges[level as keyof typeof badges] || 'bg-gray-100 text-gray-800';
  };

  // Format probability từ 0-1 sang 0-100%
  const formatProbability = (prob: number): string => {
    if (prob <= 1) {
      return (prob * 100).toFixed(1);
    }
    return prob.toFixed(1);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">🔍 Xem kết quả dự đoán</h1>
      <p className="text-gray-600 mb-8">Tìm kiếm và xem lịch sử dự đoán theo tên bệnh nhân</p>

      {/* Search Box */}
      <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Nhập tên bệnh nhân để tìm kiếm..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={loading || !searchName.trim()}
            className="px-8 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center"
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang tìm...
              </>
            ) : (
              <>
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Tìm kiếm
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      {loading && (
        <div className="text-center py-12">
          <svg className="animate-spin h-12 w-12 text-blue-600 mx-auto" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="mt-4 text-gray-600">Đang tìm kiếm...</p>
        </div>
      )}

      {!loading && searched && predictions.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
          <svg className="w-16 h-16 text-yellow-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-lg text-gray-700">Không tìm thấy kết quả nào cho "{searchName}"</p>
          <p className="text-sm text-gray-500 mt-2">Vui lòng thử với tên khác hoặc kiểm tra chính tả</p>
        </div>
      )}

      {!loading && predictions.length > 0 && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-gray-700">
              Tìm thấy <span className="font-bold text-blue-600">{predictions.length}</span> kết quả cho "{searchName}"
            </p>
            <button
              onClick={() => {
                setSearched(false);
                setPredictions([]);
                setSearchName('');
              }}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Xóa kết quả
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {predictions.map((prediction) => {
              const data = parsePrediction(prediction.predicted_label);
              if (!data) return null;

              const probability = formatProbability(data.probability);

              return (
                <div key={prediction._id} className={`border-l-4 rounded-lg shadow-lg p-6 ${getSeverityColor(data.severity_level)}`}>
                  {/* Header */}
                  <div className="flex justify-between items-start mb-4">
                    <div className="flex-1">
                      <h3 className="text-2xl font-bold text-gray-800 mb-1">{data.disease}</h3>
                      <p className="text-sm text-gray-600">
                        {prediction['Patient Name'] && (
                          <span className="font-semibold">{prediction['Patient Name']}</span>
                        )}
                        {prediction['Patient Name'] && ' | '}
                        ID: {prediction['Patient ID']}
                        {prediction['Patient Age'] && ` | ${prediction['Patient Age']} tuổi`}
                        {prediction['Patient Sex'] && ` | ${prediction['Patient Sex']}`}
                      </p>
                    </div>
                    <span className={`px-4 py-2 rounded-full text-sm font-semibold ${getSeverityBadge(data.severity_level)}`}>
                      {data.severity_name}
                    </span>
                  </div>

                  {/* Probability Bar */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm font-medium text-gray-700">Độ tin cậy</span>
                      <span className="text-lg font-bold text-gray-900">{probability}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4">
                      <div
                        className={`h-4 rounded-full transition-all duration-500 ${
                          parseFloat(probability) >= 80
                            ? 'bg-green-500'
                            : parseFloat(probability) >= 60
                            ? 'bg-yellow-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${probability}%` }}
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div className="mb-4">
                    <p className="text-gray-700 leading-relaxed">{data.description}</p>
                  </div>

                  {/* Image Info */}
                  <div className="border-t pt-4">
                    <div className="grid grid-cols-1 gap-2 text-sm">
                      <div className="flex items-center text-gray-600">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="font-mono text-xs">{prediction['Image Index']}</span>
                      </div>
                      <div className="flex items-center text-gray-600">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{new Date(prediction.timestamp).toLocaleString('vi-VN')}</span>
                      </div>
                      {prediction.hdfs_path && (
                        <div className="flex items-start text-gray-600">
                          <svg className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                          </svg>
                          <span className="font-mono text-xs break-all">{prediction.hdfs_path}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
