'use client';
import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@clerk/nextjs';
import { api } from '../../utils/api';
import { useSocket } from '../../hooks/useSocket';
import { formatDate } from '../../utils/helpers';
import { showConfirm, showAlert } from '../../components/AlertModal';
import { useWebRTC } from '../../hooks/useWebRTC';


export default function MonitorLive() {
  const { examId } = useParams();
  const router = useRouter();
  const { getToken } = useAuth();
  const socket = useSocket();
  const [students, setStudents] = useState([]);
  const studentsRef = useRef([]);
  const [exam, setExam] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [message, setMessage] = useState('');
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState('all'); // 'all', 'live', 'alerts', 'completed'
  const [stats, setStats] = useState({ total: 0, online: 0, focused: 0, alerts: 0, tabSwitches: 0 });

  // WebRTC — teacher receives live HD video streams from students
  const teacherSocketRef = useRef(null);
  const videoRef = useRef(null);
  const initiatedRef = useRef(new Set());
  useEffect(() => { teacherSocketRef.current = socket.socket; }, [socket.socket]);
  const { peers, createPeer } = useWebRTC(teacherSocketRef, socket.socket);

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      try {
        const token = await getToken();
        api.setToken(token);

        const examRes = await api.getExam(examId);
        setExam(examRes.exam);

        const studentsRes = await api.getActiveStudents(examId);
        setStudents(studentsRes.students || []);

        const logsRes = await api.getProctoringLogs(examId);
        setLogs(logsRes.logs || []);
      } catch (error) {
        console.error('Load monitor data error:', error);
      }
    };
    loadData();

    // Poll for updates every 2 seconds — server provides latest frame
    const interval = setInterval(async () => {
      try {
        const token = await getToken();
        api.setToken(token);
        const studentsRes = await api.getActiveStudents(examId);
        setStudents(studentsRes.students || []);
      } catch (error) { console.error('Polling error:', error); }
    }, 2000);

    return () => clearInterval(interval);
  }, [examId]);

  // Join monitoring room whenever socket connects/reconnects
  useEffect(() => {
    if (!socket.isConnected) return;
    socket.joinMonitoring(examId);
  }, [socket.isConnected, examId]);

  // Listen for socket events
  useEffect(() => {
    if (!socket.isConnected) return;

    const handleProctoringUpdate = (data) => {
      setStudents(prev => prev.map(s => {
        if (s.id === data.studentExamId) {
          const updates = { ...s, is_online: true };
          if (data.event === 'tab_switch') {
            updates.tab_switch_count = (s.tab_switch_count || 0) + 1;
          } else {
            updates.focus_alert_count = (s.focus_alert_count || 0) + 1;
          }
          return updates;
        }
        return s;
      }));

      setLogs(prev => [{
        event_type: data.event,
        student_exams: { users: { name: data.studentName || 'Student' } },
        created_at: new Date().toISOString(),
        severity: data.event === 'no_face' || data.event === 'multiple_faces' ? 'high' : 'medium'
      }, ...prev].slice(0, 100));
    };

    const handleStudentJoined = (data) => {
      showAlert({
        title: 'Student Joined',
        message: `${data.studentName} is now taking the exam`,
        severity: 'success',
      });
      // Pull fresh student list to include the new student
      setTimeout(async () => {
        try {
          const token = await getToken();
          api.setToken(token);
          const res = await api.getActiveStudents(examId);
          setStudents(res.students || []);
        } catch (error) { console.error('Refresh error:', error); }
      }, 500);
    };

    const handleStudentLeft = (data) => {
      setStudents(prev => prev.map(s => {
        if (s.id === data.studentExamId) {
          return { ...s, is_online: false, last_frame: null };
        }
        return s;
      }));
    };

    // Real-time online/offline status from server
    const handleStudentOnline = (data) => {
      const exists = studentsRef.current.some(s => s.id === data.studentExamId);
      if (exists) {
        setStudents(prev => prev.map(s => {
          if (s.id === data.studentExamId) {
            return {
              ...s,
              is_online: data.is_online,
              socket_id: data.is_online ? data.socketId : s.socket_id,
              last_frame: data.is_online ? s.last_frame : null
            };
          }
          return s;
        }));
      } else if (data.is_online) {
        // Student just connected — pull fresh list
        setTimeout(async () => {
          try {
            const token = await getToken();
            api.setToken(token);
            const res = await api.getActiveStudents(examId);
            setStudents(res.students || []);
          } catch (error) { console.error('Polling error:', error); }
        }, 500);
      }
    };

    // Handle real-time camera frames from students
    const handleStudentFrame = (data) => {
      setStudents(prev => prev.map(s => {
        if (s.id === data.studentExamId) {
          return { ...s, last_frame: data.frame };
        }
        return s;
      }));
    };

    socket.socket.on('proctoring_update', handleProctoringUpdate);
    socket.socket.on('student_started_exam', handleStudentJoined);
    socket.socket.on('student_left', handleStudentLeft);
    socket.socket.on('student_online', handleStudentOnline);
    socket.socket.on('student_frame', handleStudentFrame);

    return () => {
      socket.socket?.off('proctoring_update', handleProctoringUpdate);
      socket.socket?.off('student_started_exam', handleStudentJoined);
      socket.socket?.off('student_left', handleStudentLeft);
      socket.socket?.off('student_online', handleStudentOnline);
      socket.socket?.off('student_frame', handleStudentFrame);
    };
  }, [socket.isConnected, examId]);

  // Calculate stats
  useEffect(() => {
    studentsRef.current = students;
    const total = students.length;
    const online = students.filter(s => s.is_online).length;
    const focused = students.filter(s => s.is_online && (s.focus_alert_count || 0) === 0).length;
    const alerts = students.reduce((acc, s) => acc + (s.focus_alert_count || 0), 0);
    const tabSwitches = students.reduce((acc, s) => acc + (s.tab_switch_count || 0), 0);
    setStats({ total, online, focused, alerts, tabSwitches });
  }, [students]);

  // Resolve selected student from current students array (prevents stale data)
  const resolvedSelectedStudent = useMemo(() => {
    return selectedStudent ? students.find(s => s.id === selectedStudent.id) || null : null;
  }, [selectedStudent, students]);

  // Initiate WebRTC peer connection to the selected student when they're online
  const selectedSocketId = resolvedSelectedStudent?.socket_id;
  useEffect(() => {
    if (socket.isConnected && selectedSocketId && resolvedSelectedStudent?.is_online) {
      if (!initiatedRef.current.has(selectedSocketId)) {
        initiatedRef.current.add(selectedSocketId);
        createPeer(selectedSocketId, true);
      }
    }
  }, [socket.isConnected, selectedSocketId, resolvedSelectedStudent?.is_online, createPeer]);

  // Attach the remote WebRTC stream to the video element
  useEffect(() => {
    const peer = selectedSocketId ? peers[selectedSocketId] : null;
    if (videoRef.current) {
      if (peer?.stream) {
        if (videoRef.current.srcObject !== peer.stream) {
          videoRef.current.srcObject = peer.stream;
        }
        videoRef.current.play().catch(() => { });
      } else {
        videoRef.current.srcObject = null;
      }
    }
  }, [selectedSocketId, peers]);

  // Apply filters
  const filteredStudents = students.filter(s => {
    if (filter === 'all') return true;
    if (filter === 'live') return s.is_online;
    if (filter === 'alerts') return (s.focus_alert_count || 0) > 0;
    if (filter === 'completed') return s.status === 'completed';
    return true;
  });

  const handleSendMessage = async () => {
    if (!message.trim() || !selectedStudent) return;
    try {
      const token = await getToken();
      api.setToken(token);
      await api.sendMessage(selectedStudent.id, message);

      // Log locally immediately
      setLogs(prev => [{
        event_type: 'teacher_message',
        student_exams: { users: { name: selectedStudent.users?.name || 'Student' } },
        created_at: new Date().toISOString(),
        severity: 'medium'
      }, ...prev]);

      setMessage('');
    } catch (error) {
      console.error('Send message error:', error);
    }
  };

  const handleForceSubmit = async (studentExamId) => {
    const confirmed = await showConfirm({ title: 'Force Submit', message: 'Are you sure you want to force submit this student\'s exam?', confirmText: 'Force Submit', cancelText: 'Cancel', severity: 'danger' });
    if (!confirmed) return;
    try {
      const token = await getToken();
      api.setToken(token);
      await api.forceSubmit(studentExamId);

      // Update state locally
      setStudents(prev => prev.map(s => {
        if (s.id === studentExamId) {
          return { ...s, status: 'completed', is_online: false, last_frame: null };
        }
        return s;
      }));
    } catch (error) {
      console.error('Force submit error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      {/* Navigation Header */}
      <header className="bg-slate-900 text-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex justify-between items-center">
          <div>
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
              <h1 className="text-xl font-bold tracking-tight">Live Proctoring Control</h1>
            </div>
            <p className="text-xs text-slate-300 mt-1 font-mono">{exam?.title || 'Exam Session'}</p>
          </div>
          <button
            onClick={() => router.push('/dashboard')}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-lg text-xs font-semibold tracking-wider transition"
          >
            ← Back to Dashboard
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        {/* System Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
            <span className="text-2xl font-bold text-slate-800">{stats.total}</span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">Candidates</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
            <span className="text-2xl font-bold text-green-600 flex items-center gap-2">
              {stats.online}
              {stats.online > 0 && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>}
            </span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">Live Now</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
            <span className="text-2xl font-bold text-slate-700">{stats.focused}</span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">Fully Focused</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
            <span className="text-2xl font-bold text-amber-600">{stats.alerts}</span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">Focus Alerts</span>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
            <span className="text-2xl font-bold text-red-500">{stats.tabSwitches}</span>
            <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 mt-1">Tab Switches</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6">
          {/* Main Proctoring Box Grid */}
          <div className="flex-1">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <h2 className="text-base font-bold text-slate-800">Individual Candidate Monitors ({filteredStudents.length})</h2>

              {/* Category/Status Filters */}
              <div className="flex overflow-x-auto bg-slate-200/60 p-0.5 rounded-lg border border-slate-200 gap-0.5">
                {[
                  { id: 'all', label: 'All Candidates' },
                  { id: 'live', label: '🔴 Live Now' },
                  { id: 'alerts', label: '⚠️ High Alerts' },
                  { id: 'completed', label: '✓ Completed' }
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id)}
                    className={`px-3 py-1 text-xs font-semibold rounded-md transition ${filter === f.id ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {filteredStudents.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-16 text-center">
                <div className="text-4xl mb-3">🔍</div>
                <h3 className="text-sm font-bold text-slate-700">No candidates match criteria</h3>
                <p className="text-xs text-slate-400 mt-1">There are no candidates matching the active filter.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredStudents.map((student) => {
                  const isOnline = student.is_online;
                  const isCompleted = student.status === 'completed';
                  const alertCount = student.focus_alert_count || 0;
                  const tabSwitches = student.tab_switch_count || 0;

                  return (
                    <div
                      key={student.id}
                      onClick={() => setSelectedStudent(student)}
                      className={`bg-white border rounded-xl overflow-hidden shadow-sm cursor-pointer hover:shadow-md transition duration-200 flex flex-col justify-between ${selectedStudent?.id === student.id ? 'ring-2 ring-primary border-transparent' : 'border-slate-200'
                        }`}
                    >
                      {/* Monitor Body */}
                      <div className="p-3">
                        {/* Candidate Details */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-bold text-sm text-slate-800 truncate max-w-[150px]">
                            {student.users?.name || 'Candidate'}
                          </span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider flex items-center gap-1.5 ${isOnline
                              ? 'bg-green-100 text-green-700 border border-green-200'
                              : isCompleted
                                ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : isCompleted ? 'bg-blue-500' : 'bg-slate-400'
                              }`}></span>
                            {isOnline ? 'Live' : isCompleted ? 'Finished' : 'Offline'}
                          </span>
                        </div>

                        {/* Monitor Screen (Video Feed Box) */}
                        <div className="aspect-video bg-slate-900 rounded-lg flex flex-col items-center justify-center relative overflow-hidden group">
                          {isOnline ? (
                            student.last_frame ? (
                              <img
                                src={`data:image/jpeg;base64,${student.last_frame}`}
                                className="w-full h-full object-cover"
                                alt="Student Feed"
                              />
                            ) : (
                              <div className="text-center text-slate-400 p-4">
                                <div className="spinner mb-2"><div className="spinner-circle border-slate-400"></div></div>
                                <span className="text-[10px] tracking-wider font-semibold uppercase">Connecting feed...</span>
                              </div>
                            )
                          ) : (
                            <div className="text-center p-4">
                              <span className="text-3xl block mb-1">💻</span>
                              <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 block">
                                {isCompleted ? 'Exam Completed' : 'Feed Offline'}
                              </span>
                            </div>
                          )}

                          {/* Stats overlay inside video box */}
                          <div className="absolute bottom-2 left-2 right-2 flex justify-between pointer-events-none">
                            <span className="px-1.5 py-0.5 bg-black/75 text-white rounded text-[9px] font-mono">
                              Alerts: {alertCount}
                            </span>
                            <span className="px-1.5 py-0.5 bg-black/75 text-white rounded text-[9px] font-mono">
                              Tabs: {tabSwitches}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Monitor Footer Info */}
                      <div className="bg-slate-50 border-t border-slate-100 px-3 py-2 flex justify-between items-center text-xs">
                        <span className="text-slate-400 font-mono text-[9px]">ID: {student.id.substring(0, 8)}</span>
                        <span className={`font-semibold text-[10px] uppercase ${isCompleted ? 'text-primary' : 'text-slate-600'
                          }`}>
                          {student.status}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right Sidebar: Selected Candidate Controls */}
          <div className="w-full lg:w-80 shrink-0">
            {resolvedSelectedStudent ? (
              <div className="bg-white border border-slate-200 rounded-xl p-5 sticky top-6 shadow-sm">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-bold text-slate-800 text-base">{resolvedSelectedStudent.users?.name || 'Candidate Details'}</h3>
                    <p className="text-[10px] font-mono text-slate-400 mt-0.5">{resolvedSelectedStudent.users?.email}</p>
                  </div>
                  <button
                    onClick={() => setSelectedStudent(null)}
                    className="text-slate-400 hover:text-slate-600 font-semibold text-xs"
                  >
                    Close ✕
                  </button>
                </div>

                {/* Performance Stats */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 mb-4 text-xs font-medium">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Current Status:</span>
                    <span className="text-slate-800 uppercase font-bold">{resolvedSelectedStudent.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Connection:</span>
                    <span className={resolvedSelectedStudent.is_online ? 'text-green-600 font-bold' : 'text-slate-500 font-bold'}>
                      {resolvedSelectedStudent.is_online ? 'Online (Connected)' : 'Offline (Disconnected)'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Alerts:</span>
                    <span className={`font-bold ${resolvedSelectedStudent.focus_alert_count > 5 ? 'text-red-500' : 'text-slate-800'}`}>
                      {resolvedSelectedStudent.focus_alert_count || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Tab Switches:</span>
                    <span className="text-slate-800 font-bold">{resolvedSelectedStudent.tab_switch_count || 0}</span>
                  </div>
                  {resolvedSelectedStudent.score != null && (
                    <div className="flex justify-between border-t border-slate-200 pt-2 mt-2">
                      <span className="text-slate-400">Attempt Score:</span>
                      <span className="text-slate-800 font-bold">{resolvedSelectedStudent.score} marks ({Math.round(resolvedSelectedStudent.percentage)}%)</span>
                    </div>
                  )}
                </div>

                {/* Live Video Feed (WebRTC HD + frame fallback) */}
                <div className="mb-4">
                  <div className="aspect-video bg-slate-900 rounded-lg flex flex-col items-center justify-center relative overflow-hidden">
                    {peers[selectedSocketId]?.stream ? (
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                      />
                    ) : resolvedSelectedStudent?.last_frame ? (
                      <img
                        src={`data:image/jpeg;base64,${resolvedSelectedStudent.last_frame}`}
                        className="w-full h-full object-cover"
                        alt="Student Feed"
                      />
                    ) : (
                      <div className="text-center text-slate-400 p-4">
                        <div className="spinner mb-2"><div className="spinner-circle border-slate-400"></div></div>
                        <span className="text-[10px] tracking-wider font-semibold uppercase">Connecting live feed...</span>
                      </div>
                    )}
                    <span className="absolute top-2 left-2 bg-red-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                      LIVE
                    </span>
                  </div>
                </div>

                {/* Send Proctor Warning Message */}
                <div className="mb-4">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Send Direct Warning</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      placeholder="Type a custom warning..."
                      className="flex-1 px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-slate-400"
                    />
                    <button
                      onClick={handleSendMessage}
                      disabled={!message.trim()}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold tracking-wide transition disabled:opacity-50"
                    >
                      Warn
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {['Focus on screen', 'Stop looking around', 'Time is running out'].map(msg => (
                      <button
                        key={msg}
                        onClick={() => setMessage(msg)}
                        className="px-2 py-1 text-[10px] bg-slate-100 text-slate-600 rounded border border-slate-200 hover:bg-slate-200 transition font-medium"
                      >
                        {msg
                        }</button>
                    ))}
                  </div>
                </div>

                {/* Force Submit Action */}
                {resolvedSelectedStudent.status !== 'completed' && (
                  <button
                    onClick={() => handleForceSubmit(resolvedSelectedStudent.id)}
                    className="w-full py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider transition"
                  >
                    Force Submit exam
                  </button>
                )}
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-200 border-dashed rounded-xl p-8 text-center text-slate-400 sticky top-6">
                <span className="text-2xl block mb-2">👈</span>
                <span className="text-xs font-semibold uppercase tracking-wider">Select a Candidate</span>
                <p className="text-[10px] text-slate-400 mt-1">Click on any monitor card to issue warnings, verify logs, or force submit their exam paper.</p>
              </div>
            )}
          </div>
        </div>

        {/* Proctoring Logs Section */}
        <div className="mt-6 bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-bold text-slate-800 mb-4">Exam Session Activity Logs</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto font-mono text-xs text-slate-600">
            {logs.length === 0 ? (
              <p className="text-slate-400 text-center py-6 text-xs italic">No activity logs recorded yet.</p>
            ) : (
              logs.map((log, idx) => (
                <div key={idx} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${log.severity === 'high' ? 'bg-red-500 animate-pulse' : log.severity === 'medium' ? 'bg-amber-500' : 'bg-green-500'
                      }`}></span>
                    <span className="text-slate-500">[{log.student_exams?.users?.name || 'Student'}]</span>
                    <span className="text-slate-800 font-bold">{log.event_type?.replace(/_/g, ' ').toUpperCase()}</span>
                  </div>
                  <span className="text-slate-400 text-[10px]">{formatDate(log.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

