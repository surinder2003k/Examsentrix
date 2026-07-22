'use client';
import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { api } from '../../utils/api';

export default function UserManagement() {
  const { getToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const token = await getToken();
      api.setToken(token);
      const data = await api.getUsers();
      setUsers(data?.users || []);
    } catch (e) {
      console.error('Load users error:', e);
    }
    setLoading(false);
  };

  const handleGrantTeacher = async (email) => {
    try {
      const token = await getToken();
      api.setToken(token);
      await api.grantTeacher(email);
      loadUsers();
    } catch (e) {
      console.error('Grant error:', e);
    }
  };

  const handleRevokeTeacher = async (email) => {
    try {
      const token = await getToken();
      api.setToken(token);
      await api.revokeTeacher(email);
      loadUsers();
    } catch (e) {
      console.error('Revoke error:', e);
    }
  };

  const filtered = users.filter(u => u.email?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div className="text-center py-8 text-gray-500">Loading users...</div>;

  return (
    <div>
      <div className="mb-6">
        <input type="text" placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)}
          className="px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full max-w-md" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Role</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filtered.map(u => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.name || 'N/A'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.role === 'super_admin' ? 'bg-purple-100 text-purple-800' :
                    u.role === 'teacher' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {u.role?.toUpperCase()}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {u.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {u.role !== 'super_admin' && (
                    <div className="flex gap-2">
                      {u.role !== 'teacher' ? (
                        <button onClick={() => handleGrantTeacher(u.email)}
                          className="text-xs px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                          Make Teacher
                        </button>
                      ) : (
                        <button onClick={() => handleRevokeTeacher(u.email)}
                          className="text-xs px-3 py-1 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
                          Remove Teacher
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

