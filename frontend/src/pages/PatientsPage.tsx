import React, { useState, useEffect } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

interface Patient {
  _id: string;
  patient_id: string;
  patient_name: string;
  patient_age?: number;
  patient_sex?: string;
  phone?: string;
  address?: string;
  notes?: string;
  created_at: string;
  total_predictions: number;
}

interface PatientProfile extends Patient {
  predictions: Array<{
    _id: string;
    'Image Index': string;
    'Patient ID': string;
    hdfs_path: string;
    predicted_label: string;
    timestamp: string;
  }>;
}

interface NewPatient {
  patient_id: string;
  patient_name: string;
  patient_age?: number;
  patient_sex?: string;
  phone?: string;
  address?: string;
  notes?: string;
}

export const PatientsPage: React.FC = () => {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientProfile, setPatientProfile] = useState<PatientProfile | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  
  const [newPatient, setNewPatient] = useState<NewPatient>({
    patient_id: '',
    patient_name: '',
    patient_age: undefined,
    patient_sex: '',
    phone: '',
    address: '',
    notes: ''
  });

  // Generate a unique patient ID
  const generatePatientId = () => {
    const prefix = 'P';
    const timestamp = Date.now().toString().slice(-8);
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${prefix}${timestamp}${random}`;
  };

  useEffect(() => {
    fetchPatients();
  }, [searchTerm]);

  useEffect(() => {
    if (showAddModal) {
      // Tự động sinh ID mới khi mở modal
      setNewPatient(prev => ({
        ...prev,
        patient_id: generatePatientId()
      }));
    }
  }, [showAddModal]);

  const fetchPatients = async () => {
    try {
      setLoading(true);
      const url = searchTerm 
        ? `${API_BASE_URL}/patients?search=${encodeURIComponent(searchTerm)}&limit=100`
        : `${API_BASE_URL}/patients?limit=100`;
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Không thể tải danh sách bệnh nhân');
      
      const data = await response.json();
      setPatients(data.results);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã xảy ra lỗi');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPatient = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newPatient.patient_name) {
      alert('Vui lòng nhập tên bệnh nhân');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/patients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPatient)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Không thể tạo bệnh nhân');
      }

      alert('Thêm bệnh nhân thành công!');
      setShowAddModal(false);
      setNewPatient({
        patient_id: '',
        patient_name: '',
        patient_age: undefined,
        patient_sex: '',
        phone: '',
        address: '',
        notes: ''
      });
      fetchPatients();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Đã xảy ra lỗi');
    }
  };

  const handleViewProfile = async (patient: Patient) => {
    setSelectedPatient(patient);
    setShowProfileModal(true);
    setLoadingProfile(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/patients/${patient.patient_id}`);
      if (!response.ok) throw new Error('Không thể tải profile');
      
      const data = await response.json();
      setPatientProfile(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Đã xảy ra lỗi');
    } finally {
      setLoadingProfile(false);
    }
  };

  const handleDeletePatient = async () => {
    if (!selectedPatient) return;

    try {
      const response = await fetch(`${API_BASE_URL}/patients/${selectedPatient.patient_id}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error('Không thể xóa bệnh nhân');

      alert('Xóa bệnh nhân thành công!');
      setShowDeleteConfirm(false);
      setSelectedPatient(null);
      fetchPatients();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Đã xảy ra lỗi');
    }
  };

  const parsePrediction = (labelJson: string) => {
    try {
      const data = JSON.parse(labelJson);
      return {
        disease: data.disease || 'N/A',
        severity: data.severity_level || 0,
        probability: data.probability || 0
      };
    } catch {
      return { disease: 'N/A', severity: 0, probability: 0 };
    }
  };

  const formatProbability = (prob: number): string => {
    if (prob <= 1) return (prob * 100).toFixed(1);
    return prob.toFixed(1);
  };

  const getSeverityColor = (severity: number): string => {
    const colors = ['bg-green-100 text-green-800', 'bg-blue-100 text-blue-800', 'bg-yellow-100 text-yellow-800', 'bg-orange-100 text-orange-800', 'bg-red-100 text-red-800'];
    return colors[severity] || colors[0];
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">Quản Lý Bệnh Nhân</h1>
          <p className="text-gray-600">Xem, thêm, xóa và quản lý thông tin bệnh nhân</p>
        </div>

        {/* Actions Bar */}
        <div className="bg-white rounded-lg shadow-sm p-4 mb-6 flex gap-4 items-center">
          <input
            type="text"
            placeholder="Tìm kiếm theo tên..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <button
            onClick={() => setShowAddModal(true)}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            + Thêm Bệnh Nhân
          </button>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Đang tải...</p>
          </div>
        ) : (
          <>
            {/* Patients Table */}
            <div className="bg-white rounded-lg shadow-sm overflow-hidden">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tên</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tuổi</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Giới tính</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SĐT</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Số lần khám</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {patients.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        Không có bệnh nhân nào
                      </td>
                    </tr>
                  ) : (
                    patients.map((patient) => (
                      <tr key={patient._id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {patient.patient_id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {patient.patient_name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {patient.patient_age || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {patient.patient_sex === 'M' ? 'Nam' : patient.patient_sex === 'F' ? 'Nữ' : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {patient.phone || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">
                            {patient.total_predictions} lần
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                          <button
                            onClick={() => handleViewProfile(patient)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            Xem
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPatient(patient);
                              setShowDeleteConfirm(true);
                            }}
                            className="text-red-600 hover:text-red-900"
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Summary */}
            <div className="mt-4 text-sm text-gray-600 text-center">
              Tổng: {patients.length} bệnh nhân
            </div>
          </>
        )}

        {/* Add Patient Modal */}
        {showAddModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold mb-4">Thêm Bệnh Nhân Mới</h2>
              <form onSubmit={handleAddPatient} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    ID Bệnh Nhân (tự động)
                  </label>
                  <input
                    type="text"
                    value={newPatient.patient_id}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                  />
                  <p className="text-xs text-gray-500 mt-1">ID được tự động sinh khi mở form</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Tên <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newPatient.patient_name}
                    onChange={(e) => setNewPatient({ ...newPatient, patient_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tuổi</label>
                    <input
                      type="number"
                      value={newPatient.patient_age || ''}
                      onChange={(e) => setNewPatient({ ...newPatient, patient_age: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      min="0"
                      max="150"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Giới tính</label>
                    <select
                      value={newPatient.patient_sex}
                      onChange={(e) => setNewPatient({ ...newPatient, patient_sex: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Chọn</option>
                      <option value="M">Nam</option>
                      <option value="F">Nữ</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Số điện thoại</label>
                  <input
                    type="tel"
                    value={newPatient.phone}
                    onChange={(e) => setNewPatient({ ...newPatient, phone: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ</label>
                  <input
                    type="text"
                    value={newPatient.address}
                    onChange={(e) => setNewPatient({ ...newPatient, address: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú</label>
                  <textarea
                    value={newPatient.notes}
                    onChange={(e) => setNewPatient({ ...newPatient, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows={3}
                  />
                </div>
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                  >
                    Thêm
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                  >
                    Hủy
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Profile Modal */}
        {showProfileModal && selectedPatient && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
            <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 my-8 max-h-[90vh] overflow-y-auto">
              <h2 className="text-2xl font-bold mb-4">Profile Bệnh Nhân</h2>
              
              {loadingProfile ? (
                <div className="text-center py-8">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                </div>
              ) : patientProfile ? (
                <>
                  {/* Patient Info */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-600">ID</p>
                        <p className="font-medium">{patientProfile.patient_id}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Tên</p>
                        <p className="font-medium">{patientProfile.patient_name}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Tuổi</p>
                        <p className="font-medium">{patientProfile.patient_age || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Giới tính</p>
                        <p className="font-medium">
                          {patientProfile.patient_sex === 'M' ? 'Nam' : patientProfile.patient_sex === 'F' ? 'Nữ' : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Số điện thoại</p>
                        <p className="font-medium">{patientProfile.phone || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Địa chỉ</p>
                        <p className="font-medium">{patientProfile.address || '-'}</p>
                      </div>
                      {patientProfile.notes && (
                        <div className="col-span-2">
                          <p className="text-sm text-gray-600">Ghi chú</p>
                          <p className="font-medium">{patientProfile.notes}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Predictions History */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3">
                      Lịch Sử Chụp X-quang ({patientProfile.total_predictions} lần)
                    </h3>
                    {patientProfile.predictions.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">Chưa có lần chụp nào</p>
                    ) : (
                      <div className="space-y-3">
                        {patientProfile.predictions.map((pred) => {
                          const { disease, severity, probability } = parsePrediction(pred.predicted_label);
                          return (
                            <div key={pred._id} className="border border-gray-200 rounded-lg p-4">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <p className="font-medium text-lg">{disease}</p>
                                  <p className="text-sm text-gray-500">{pred['Image Index']}</p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getSeverityColor(severity)}`}>
                                  Mức {severity}
                                </span>
                              </div>
                              <div className="mt-2">
                                <div className="flex justify-between text-sm mb-1">
                                  <span>Xác suất:</span>
                                  <span className="font-semibold">{formatProbability(probability)}%</span>
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-2">
                                  <div
                                    className={`h-2 rounded-full ${
                                      probability >= 70 ? 'bg-red-500' : probability >= 40 ? 'bg-yellow-500' : 'bg-green-500'
                                    }`}
                                    style={{ width: `${formatProbability(probability)}%` }}
                                  ></div>
                                </div>
                              </div>
                              <p className="text-xs text-gray-500 mt-2">
                                {new Date(pred.timestamp).toLocaleString('vi-VN')}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-red-500">Không thể tải profile</p>
              )}

              <button
                onClick={() => {
                  setShowProfileModal(false);
                  setPatientProfile(null);
                }}
                className="mt-6 w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
              >
                Đóng
              </button>
            </div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && selectedPatient && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
              <h2 className="text-xl font-bold mb-4 text-red-600">Xác Nhận Xóa</h2>
              <p className="mb-6">
                Bạn có chắc chắn muốn xóa bệnh nhân <strong>{selectedPatient.patient_name}</strong> (ID: {selectedPatient.patient_id})?
              </p>
              <p className="text-sm text-gray-600 mb-6">
                Lưu ý: Thông tin bệnh nhân sẽ bị xóa nhưng lịch sử chụp X-quang vẫn được giữ lại trong hệ thống.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeletePatient}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium"
                >
                  Xóa
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setSelectedPatient(null);
                  }}
                  className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium"
                >
                  Hủy
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
