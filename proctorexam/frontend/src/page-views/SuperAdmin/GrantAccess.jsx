'use client';
import React, { useEffect, useState } from 'react';
import { useAuth } from '@clerk/nextjs';
import { api } from '../../utils/api';
import { showAlert, showConfirm } from '../../components/AlertModal';
import { SUPER_ADMIN_EMAIL } from '../../utils/constants';

export default function GrantAccess() {
  const { getToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [search, setSearch] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      const token = await getToken();
      api.setToken(token);
      const data = await api.getUsers();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Load users error:', error);
    }
    setLoading(false);
  };

  const handleApprove = async (email, role) => {
    const key = `${email}-approve-${role}`;
    setActionLoading(prev => ({ ...prev, [key]: true }));
    try {
      const token = await getToken();
      api.setToken(token);
      await api.approveUser(email, role);
      showAlert({ title: 'Success', message: `User "${email}" approved successfully as ${role}!`, severity: 'success' });
      await loadUsers();
    } catch (error) {
      console.error('Approve user error:', error);
      showAlert({ title: 'Error', message: `Failed to approve user: ${error.message}`, severity: 'error' });
    }
    setActionLoading(prev => ({ ...prev, [key]: false }));
  };

  const handleDisallow = async (email) => {
    const confirmed = await showConfirm({ title: 'Deny User', message: `Are you sure you want to DENY and permanently REMOVE "${email}" from the platform?`, confirmText: 'Deny & Remove', cancelText: 'Cancel', severity: 'danger' });
    if (!confirmed) return;
    const key = `${email}-disallow`;
    setActionLoading(prev => ({ ...prev, [key]: true }));
    try {
      const token = await getToken();
      api.setToken(token);
      const res = await api.disallowUser(email);
      showAlert({ title: 'Success', message: `User "${email}" denied and permanently removed!`, severity: 'success' });
      await loadUsers();
    } catch (error) {
      console.error('Deny user error:', error);
      showAlert({ title: 'Error', message: `Failed to deny user: ${error.message}`, severity: 'error' });
    }
    setActionLoading(prev => ({ ...prev, [key]: false }));
  };

  const handleChangeRole = async (email, role) => {
    const key = `${email}-role-${role}`;
    setActionLoading(prev => ({ ...prev, [key]: true }));
    try {
      const token = await getToken();
      api.setToken(token);
      await api.changeRole(email, role);
      showAlert({ title: 'Success', message: `User role updated to ${role} successfully!`, severity: 'success' });
      await loadUsers();
    } catch (error) {
      console.error('Change role error:', error);
      showAlert({ title: 'Error', message: `Failed to change role: ${error.message}`, severity: 'error' });
    }
    setActionLoading(prev => ({ ...prev, [key]: false }));
  };

  const filteredUsers = users.filter(u =>
    u.name?.toLowerCase().includes(search.toLowerCase()) ||
    u.email?.toLowerCase().includes(search.toLowerCase())
  );

  const stats = {
    total: users.length,
    pending: users.filter(u => !u.is_active && u.role !== 'super_admin').length,
    teachers: users.filter(u => u.is_active && u.role === 'teacher').length,
    students: users.filter(u => u.is_active && u.role === 'student').length,
  };

  return (
    <div className="w-full">
      {/* Header section fitting parent container */}
      <div className="flex-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-slate-900">User Management System</h2>
          <p className="text-xs text-slate-500 mt-1">Review active registries, approve teacher credentials, or disallow student tokens.</p>
        </div>
        <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold uppercase tracking-wider">
          System Admin Room
        </span>
      </div>

      {/* Stats Cards */}
      <div className="grid-stats">
        <div className="stat-card">
          <div className="stat-label">Total Registered</div>
          <div className="stat-value text-primary">{stats.total}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Pending Approval</div>
          <div className="stat-value text-amber-500">{stats.pending}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Teachers</div>
          <div className="stat-value text-purple">{stats.teachers}</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Active Students</div>
          <div className="stat-value text-blue">{stats.students}</div>
        </div>
      </div>

      {/* Search Field */}
      <div className="mb-5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by candidate name or email address..."
          className="form-control py-2.5"
        />
      </div>

      {/* Responsive Users Table */}
      <div className="tbl-wrapper">
        <table className="tbl access-table">
          <thead>
            <tr>
              <th className="px-5 py-4">User Details</th>
              <th className="px-5 py-4">Email</th>
              <th className="px-5 py-4 text-center">Role</th>
              <th className="px-5 py-4 text-center">Status</th>
              <th className="px-4 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                  <div className="spinner"><div className="spinner-circle"></div></div>
                  <span className="text-xs">Loading registered users...</span>
                </td>
              </tr>
            ) : filteredUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-10 text-center text-slate-400 text-sm">
                  No registered users match the filter criteria.
                </td>
              </tr>
            ) : (
              filteredUsers.map((user) => {
                const isSelf = SUPER_ADMIN_EMAIL && user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();
                return (
                  <tr key={user.id} className="hover:bg-slate-50">
                    <td className="px-5 py-4" data-label="User Details">
                      <div>
                        <span className="font-bold text-slate-900 block text-sm">{user.name || 'Anonymous'}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{user.clerk_id}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-slate-600 text-sm font-medium" data-label="Email">
                      {user.email}
                    </td>
                    <td className="px-5 py-4 text-center" data-label="Role">
                      <span className={`badge ${
                        user.role === 'super_admin' ? 'badge-red' :
                        user.role === 'teacher' ? 'badge-purple' :
                        'badge-blue'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center" data-label="Status">
                      <span className={`badge ${
                        user.is_active ? 'badge-green' : 'badge-amber'
                      }`}>
                        {user.is_active ? 'Active' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right" data-label="Actions">
                      {isSelf ? (
                        <span className="text-xs text-slate-400 font-semibold bg-slate-100 px-2 py-1 rounded">Owner</span>
                      ) : !user.is_active ? (
                        <div className="flex justify-end gap-1.5">
                          <button
                            onClick={() => handleApprove(user.email, 'student')}
                            disabled={actionLoading[`${user.email}-approve-student`]}
                            className="btn btn-primary btn-xs"
                          >
                            {actionLoading[`${user.email}-approve-student`] ? '...' : '✓ Student'}
                          </button>
                          <button
                            onClick={() => handleApprove(user.email, 'teacher')}
                            disabled={actionLoading[`${user.email}-approve-teacher`]}
                            className="btn btn-purple btn-xs"
                          >
                            {actionLoading[`${user.email}-approve-teacher`] ? '...' : '✓ Teacher'}
                          </button>
                          <button
                            onClick={() => handleDisallow(user.email)}
                            disabled={actionLoading[`${user.email}-disallow`]}
                            className="btn btn-danger btn-xs"
                          >
                            {actionLoading[`${user.email}-disallow`] ? '...' : '✕'}
                          </button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1.5">
                          {user.role === 'student' && (
                            <button
                              onClick={() => handleChangeRole(user.email, 'teacher')}
                              disabled={actionLoading[`${user.email}-role-teacher`]}
                              className="btn btn-secondary btn-xs"
                            >
                              {actionLoading[`${user.email}-role-teacher`] ? '...' : '→ Teacher'}
                            </button>
                          )}
                          {user.role === 'teacher' && (
                            <button
                              onClick={() => handleChangeRole(user.email, 'student')}
                              disabled={actionLoading[`${user.email}-role-student`]}
                              className="btn btn-secondary btn-xs"
                            >
                              {actionLoading[`${user.email}-role-student`] ? '...' : '→ Student'}
                            </button>
                          )}
                          <button
                            onClick={() => handleDisallow(user.email)}
                            disabled={actionLoading[`${user.email}-disallow`]}
                            className="btn btn-danger-outline btn-xs"
                          >
                            {actionLoading[`${user.email}-disallow`] ? '...' : '✕'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

