import React, { useState } from 'react';

interface UploadResponse {
  status: string;
  message: string;
  image_id: string;
  hdfs_path: string;
  patient_id: string;
  timestamp: string;
}

export const UploadPage: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [patientName, setPatientName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setError(null);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type.startsWith('image/')) {
      setFile(droppedFile);
      setError(null);
      const reader = new FileReader();
      reader.onloadend = () => setPreview(reader.result as string);
      reader.readAsDataURL(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file || !patientName.trim()) {
      setError('Vui lòng chọn ảnh và nhập tên bệnh nhân');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('patient_name', patientName.trim());
      formData.append('follow_up', '0');

      // Use /api/upload which will be proxied by nginx to backend
      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Upload thất bại');
      }

      const result: UploadResponse = await response.json();
      setSuccessMessage(
        `✅ Upload thành công!\nẢnh đã được lưu và đang được xử lý.\nImage ID: ${result.image_id}`
      );
      
      // Reset form
      setFile(null);
      setPreview(null);
      setPatientName('');
      
      // Clear success message after 10 seconds
      setTimeout(() => setSuccessMessage(null), 10000);
    } catch (err: any) {
      setError(err.message || 'Có lỗi xảy ra khi upload');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Upload ảnh X-Ray</h1>
      <p className="text-gray-600 mb-8">Tải lên ảnh X-Ray phổi để nhận dự đoán bệnh tự động</p>

      {/* Success Message */}
      {successMessage && (
        <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-6 py-4 rounded-lg flex items-start">
          <svg className="w-6 h-6 mr-3 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="whitespace-pre-line">{successMessage}</div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-lg p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Patient Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Tên bệnh nhân <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={patientName}
              onChange={(e) => setPatientName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
              placeholder="Nhập tên đầy đủ của bệnh nhân"
              required
              disabled={loading}
            />
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Chọn ảnh X-Ray <span className="text-red-500">*</span>
            </label>
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="relative border-2 border-dashed border-gray-300 rounded-lg hover:border-blue-400 transition-colors"
            >
              {preview ? (
                <div className="relative">
                  <img src={preview} alt="Preview" className="w-full h-96 object-contain rounded-lg" />
                  <button
                    type="button"
                    onClick={() => {
                      setFile(null);
                      setPreview(null);
                    }}
                    className="absolute top-4 right-4 bg-red-500 text-white p-2 rounded-full hover:bg-red-600 transition-colors"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-96 cursor-pointer">
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <svg className="w-16 h-16 mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="mb-2 text-lg text-gray-600">
                      <span className="font-semibold">Click để chọn file</span> hoặc kéo thả vào đây
                    </p>
                    <p className="text-sm text-gray-500">PNG, JPG, JPEG (Tối đa 10MB)</p>
                  </div>
                  <input
                    type="file"
                    className="hidden"
                    accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                    onChange={handleFileChange}
                    disabled={loading}
                  />
                </label>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !file || !patientName.trim()}
            className="w-full bg-blue-600 text-white py-4 px-6 rounded-lg font-semibold text-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
          >
            {loading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Đang upload và xử lý...
              </>
            ) : (
              <>
                <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                Upload và Dự đoán
              </>
            )}
          </button>
        </form>

        {/* Info Box */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex">
            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-2 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Lưu ý:</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Ảnh sẽ được lưu trữ trên HDFS và xử lý bởi Spark Streaming</li>
                <li>Thời gian xử lý trung bình: 10-30 giây</li>
                <li>Kết quả sẽ được lưu vào MongoDB và có thể xem trong mục "Xem kết quả"</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
