import React from 'react';

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

interface PatientDetailModalProps {
  prediction: Prediction | null;
  isOpen: boolean;
  onClose: () => void;
  onExaminedChange?: (predictionId: string, examined: boolean) => void;
  showExaminedButton?: boolean;
}

const PatientDetailModal: React.FC<PatientDetailModalProps> = ({
  prediction,
  isOpen,
  onClose,
  onExaminedChange,
  showExaminedButton = true,
}) => {
  if (!isOpen || !prediction) return null;

  const severityColors = {
    0: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-300' },
    1: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-300' },
    2: { bg: 'bg-yellow-100', text: 'text-yellow-800', border: 'border-yellow-300' },
    3: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-300' },
    4: { bg: 'bg-red-100', text: 'text-red-800', border: 'border-red-300' },
  };

  const parsePredictionLabel = (prediction: Prediction) => {
    try {
      const label = (prediction as any).predicted_label;
      if (!label) return [];
      
      let parsed;
      if (typeof label === 'string') {
        parsed = JSON.parse(label);
      } else {
        parsed = label;
      }
      
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      console.error('Error parsing prediction label:', error);
      return [];
    }
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" 
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900">Chi tiết ca bệnh</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ảnh X-quang */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">Ảnh X-quang</h3>
              <div className="bg-gray-100 rounded-lg overflow-hidden">
                <img
                  src={`/api/xray-image/${prediction['Image Index']}`}
                  alt={`X-ray ${prediction['Image Index']}`}
                  className="w-full h-auto"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect fill="%23ddd" width="400" height="400"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em"%3EẢnh không khả dụng%3C/text%3E%3C/svg%3E';
                  }}
                />
              </div>
              <div className="text-sm text-gray-600">
                <p><strong>File:</strong> {prediction['Image Index']}</p>
                <p><strong>Follow-up:</strong> #{(prediction as any)['Follow-up #'] || '0'}</p>
              </div>
            </div>

            {/* Thông tin bệnh nhân */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800">Thông tin bệnh nhân</h3>
              <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">ID:</span>
                  <span className="font-medium">{prediction['Patient ID']}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tên:</span>
                  <span className="font-medium">{prediction['Patient Name'] || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Tuổi:</span>
                  <span className="font-medium">{prediction['Patient Age'] || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Giới tính:</span>
                  <span className="font-medium">
                    {prediction['Patient Sex'] === 'M' ? 'Nam' : prediction['Patient Sex'] === 'F' ? 'Nữ' : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Thời gian chờ:</span>
                  <span className="font-medium">
                    {prediction._hours_waiting ? `${prediction._hours_waiting.toFixed(1)} giờ` : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Điểm ưu tiên:</span>
                  <span className="font-bold text-blue-600 text-lg">
                    {prediction._priority_score?.toFixed(1) || '0.0'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-600">Trạng thái:</span>
                  <span 
                    className={`px-3 py-1 rounded-full text-sm font-semibold ${
                      prediction.examined ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {prediction.examined ? 'Đã khám' : 'Chưa khám'}
                  </span>
                </div>
              </div>

              {/* Kết quả chẩn đoán */}
              <h3 className="text-lg font-semibold text-gray-800 mt-6">Kết quả chẩn đoán AI</h3>
              <div className="space-y-2">
                {parsePredictionLabel(prediction).map((pred: any, idx: number) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border-2 ${
                      idx === 0
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-900">{pred.disease}</span>
                          {idx === 0 && (
                            <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded">Chính</span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600 mt-1">{pred.description}</p>
                        <div className="flex items-center gap-4 mt-2">
                          <span className="text-sm text-gray-600">
                            Xác suất: <strong>{(pred.probability * 100).toFixed(1)}%</strong>
                          </span>
                          <span
                            className={`px-2 py-1 text-xs rounded-full ${
                              severityColors[pred.severity_level as keyof typeof severityColors].bg
                            } ${severityColors[pred.severity_level as keyof typeof severityColors].text}`}
                          >
                            {pred.severity_name}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Đóng
            </button>
            {showExaminedButton && onExaminedChange && (
              <button
                onClick={() => {
                  onExaminedChange(prediction._id, !prediction.examined);
                }}
                className={`px-6 py-2 rounded-lg transition-colors ${
                  prediction.examined
                    ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                    : 'bg-green-500 hover:bg-green-600 text-white'
                }`}
              >
                {prediction.examined ? 'Đánh dấu chưa khám' : 'Đánh dấu đã khám'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PatientDetailModal;
