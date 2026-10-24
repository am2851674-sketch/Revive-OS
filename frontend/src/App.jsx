import { useCallback, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import hljs from 'highlight.js/lib/core';
import javascript from 'highlight.js/lib/languages/javascript';
import typescript from 'highlight.js/lib/languages/typescript';
import python from 'highlight.js/lib/languages/python';
import css from 'highlight.js/lib/languages/css';
import xml from 'highlight.js/lib/languages/xml';
import jsonLanguage from 'highlight.js/lib/languages/json';
import sql from 'highlight.js/lib/languages/sql';
import yaml from 'highlight.js/lib/languages/yaml';
import 'highlight.js/styles/github-dark.css';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Bell, Bot, Check, CheckCircle2,
  ChevronDown, Clock3, Code2, Compass, Download, FileArchive, FileCode2, Files,
  FolderKanban, Gauge, Handshake, LoaderCircle, LogOut,
  Menu, MessageSquare, Move, NotebookPen, Plus, Route, Search, Send, Settings2,
  ShieldCheck, Sparkles, Trash2, Upload, X, Zap,
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

const API = import.meta.env.VITE_API_URL || '/api';
const CATEGORIES = ['Web App', 'Mobile App', 'AI & Data', 'Developer Tools', 'Games', 'Other'];
const tokenStore = 'revive-os-token';
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('python', python);
hljs.registerLanguage('css', css);
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('json', jsonLanguage);
hljs.registerLanguage('sql', sql);
hljs.registerLanguage('yaml', yaml);

async function api(path, options = {}, token = localStorage.getItem(tokenStore)) {
  const headers = { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || 'Something went wrong. Please try again.');
  return data;
}

function App() {
  const [token, setToken] = useState(() => localStorage.getItem(tokenStore));
  const [user, setUser] = useState(null);
  const [sessionLoading, setSessionLoading] = useState(Boolean(localStorage.getItem(tokenStore)));
  const [authMode, setAuthMode] = useState('login');
  const [authForm, setAuthForm] = useState({ name: '', email: '', password: '' });
  const [page, setPage] = useState('overview');
  const [previousPage, setPreviousPage] = useState('discover');
  const [uploadMode, setUploadMode] = useState('zip');
  const [projects, setProjects] = useState([]);
  const [discovered, setDiscovered] = useState([]);
  const [downloads, setDownloads] = useState([]);
  const [activity, setActivity] = useState([]);
  const [stats, setStats] = useState({ uploads: 0, active: 0, completed: 0, downloads: 0 });
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All categories');
  const [technology, setTechnology] = useState('All technologies');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(null);
  const [toast, setToast] = useState(null);
  const [error, setError] = useState('');
  const [mobileNav, setMobileNav] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileSaved, setProfileSaved] = useState(false);
  const [roadmapChoice, setRoadmapChoice] = useState('Continue');
  const [inspect, setInspect] = useState(null);
  const [notes, setNotes] = useState('');
  const [revivalRequests, setRevivalRequests] = useState([]);
  const [versions, setVersions] = useState([]);
  const [matches, setMatches] = useState([]);
  const [members, setMembers] = useState([]);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [aiStatus, setAiStatus] = useState({ configured: false, model: '' });
  const [profileSkills, setProfileSkills] = useState('');
  const [canvasStatus, setCanvasStatus] = useState({});
  const [activeCanvasZone, setActiveCanvasZone] = useState(null);
  const [draggedCard, setDraggedCard] = useState(null);
  const [shartiOpen, setShartiOpen] = useState(false);
  const [shartiProjectId, setShartiProjectId] = useState('');
  const [shartiBusy, setShartiBusy] = useState(false);
  const [shartiError, setShartiError] = useState('');
  const [shartiProposals, setShartiProposals] = useState([]);
  const [proposalStatus, setProposalStatus] = useState({});
  const [avatarPosition, setAvatarPosition] = useState(() => ({ x: Math.max(12, window.innerWidth - 82), y: Math.max(12, window.innerHeight - 90) }));
  const actionInFlight = useRef(false);
  const avatarDrag = useRef(null);

  const notify = (message, kind = 'success') => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 3600);
  };

  const refreshWorkspace = useCallback(async (activeToken = token) => {
    const [me, dashboard, mine, publicProjects, history] = await Promise.all([
      api('/auth/me', {}, activeToken), api('/dashboard', {}, activeToken),
      api('/projects', {}, activeToken), api('/discover?limit=100', {}, activeToken),
      api('/downloads', {}, activeToken),
    ]);
    setUser(me);
    setProfileName(me.name);
    setProfileSkills((me.skills || []).join(', '));
    setStats(dashboard.stats);
    setProjects(mine);
    setDiscovered(publicProjects);
    setDownloads(history);
    setActivity(dashboard.activity);
  }, [token]);

  useEffect(() => {
    if (!token) {
      return;
    }
    let cancelled = false;
    Promise.resolve().then(() => refreshWorkspace(token))
      .catch((cause) => {
        if (cancelled) return;
        localStorage.removeItem(tokenStore);
        setToken(null);
        setError(cause.message);
      })
      .finally(() => { if (!cancelled) setSessionLoading(false); });
    return () => { cancelled = true; };
  }, [token, refreshWorkspace]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    api('/ai/status', {}, null).then(setAiStatus).catch(() => setAiStatus({ configured: false, model: '' }));
  }, []);

  const run = async (operation) => {
    setBusy(true);
    setError('');
    try {
      await operation();
      return true;
    } catch (cause) {
      setError(cause.message || 'Something went wrong. Please try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const submitAuth = (event) => {
    event.preventDefault();
    run(async () => {
      const endpoint = authMode === 'signup' ? '/auth/signup' : '/auth/login';
      const result = await api(endpoint, { method: 'POST', body: JSON.stringify(authForm) }, null);
      localStorage.setItem(tokenStore, result.token);
      setUser(result.user);
      setToken(result.token);
      setPage('overview');
      notify(authMode === 'signup' ? 'Your REVIVE account is ready.' : 'Welcome back.');
    });
  };

  const logout = () => run(async () => {
    await api('/auth/logout', { method: 'POST' }, token);
    localStorage.removeItem(tokenStore);
    setToken(null);
    setUser(null);
    setSelected(null);
    setPage('overview');
    notify('You have been signed out.');
  });

  const openProject = async (project) => {
    setPreviousPage(page === 'project' ? previousPage : page);
    setSelected(project);
    setPage('project');
    setMobileNav(false);
    try {
      const fullProject = await api(`/projects/${project.id}`, {}, token);
      setSelected(fullProject);
      setRoadmapChoice(fullProject.direction || fullProject.analysis?.recommendation || 'Continue');
      setNotes(fullProject.notes || '');
      const [projectVersions, messages] = await Promise.all([
        api(`/projects/${project.id}/versions`, {}, token),
        api(`/projects/${project.id}/ai/messages`, {}, token),
      ]);
      setVersions(projectVersions);
      setChatMessages(messages);
      const isOwner = projects.some((item) => item.id === project.id);
      setShartiProjectId(project.id);
      if (isOwner) {
        const [requests, projectMatches, projectMembers, pendingProposals] = await Promise.all([
          api(`/projects/${project.id}/revival-requests`, {}, token),
          api(`/projects/${project.id}/matches`, {}, token),
          api(`/projects/${project.id}/members`, {}, token),
          api(`/projects/${project.id}/ai/proposals`, {}, token),
        ]);
        setRevivalRequests(requests);
        setMatches(projectMatches);
        setMembers(projectMembers.map((member) => ({ ...member, skills: JSON.parse(member.skills) })));
        setShartiProposals(pendingProposals);
      } else if (fullProject.is_member) {
        const projectMembers = await api(`/projects/${project.id}/members`, {}, token);
        setMembers(projectMembers.map((member) => ({ ...member, skills: JSON.parse(member.skills) })));
        setRevivalRequests([]);
        setMatches([]);
      } else {
        setRevivalRequests([]);
        setMatches([]);
        setMembers([]);
        setChatMessages([]);
        setShartiProposals([]);
      }
      return true;
    } catch (cause) {
      setError(cause.message);
      return false;
    }
  };

  const searchProjects = async (event) => {
    event?.preventDefault();
    await run(async () => {
      const params = new URLSearchParams({ limit: '100' });
      if (query.trim()) params.set('q', query.trim());
      if (category !== 'All categories') params.set('category', category);
      if (technology !== 'All technologies') params.set('technology', technology);
      setDiscovered(await api(`/discover?${params}`, {}, token));
    });
  };

  const uploadProject = (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const mode = uploadMode;
    const technologiesList = String(data.get('technologies') || '').split(',').map((item) => item.trim()).filter(Boolean);
    if (mode === 'github' || mode === 'manual') {
      run(async () => {
        const payload = Object.fromEntries(data.entries());
        payload.technologies = technologiesList;
        payload.completion = Number(payload.completion || 0);
        const result = mode === 'github'
          ? await api('/projects/github', { method: 'POST', body: JSON.stringify(payload) }, token)
          : await api('/projects/manual', { method: 'POST', body: JSON.stringify(payload) }, token);
        await refreshWorkspace(token);
        setSelected(result);
        setPage('project');
        notify(mode === 'github' ? 'Repository imported and saved.' : 'Project saved and published.');
      });
      return;
    }
    const file = data.get('file');
    if (!(file instanceof File) || file.size === 0) {
      setError('Choose a ZIP archive to upload.');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.zip') || file.size > 15 * 1024 * 1024) {
      setError('Choose a ZIP file no larger than 15 MB.');
      return;
    }
    data.set('technologies', JSON.stringify(technologiesList));
    setBusy(true);
    setError('');
    setUploadProgress(0);
    const request = new XMLHttpRequest();
    request.open('POST', `${API}/projects/zip`);
    request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.upload.onprogress = (progress) => {
      if (progress.lengthComputable) setUploadProgress(Math.round((progress.loaded / progress.total) * 100));
    };
    request.onerror = () => {
      setBusy(false);
      setUploadProgress(null);
      setError('Upload failed. Check your connection and try again.');
    };
    request.onload = async () => {
      let result;
      try { result = JSON.parse(request.responseText); } catch { result = {}; }
      if (request.status < 200 || request.status >= 300) {
        setError(result.detail || 'Upload failed. Check the ZIP file and try again.');
        setBusy(false);
        setUploadProgress(null);
        return;
      }
      try {
        await refreshWorkspace(token);
        setSelected(result);
        setPage('project');
        notify('Project uploaded and published to discovery.');
      } catch (cause) {
        setError(cause.message);
      }
      setBusy(false);
      setUploadProgress(null);
    };
    request.send(data);
  };

  const downloadProject = async (project) => {
    setDownloadProgress({ id: project.id, loaded: 0, total: 0 });
    setError('');
    try {
      const response = await fetch(`${API}/projects/${project.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || 'Download could not be started.');
      }
      const total = Number(response.headers.get('Content-Length')) || 0;
      const reader = response.body.getReader();
      const chunks = [];
      let loaded = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.byteLength;
        setDownloadProgress({ id: project.id, loaded, total });
      }
      const blob = new Blob(chunks, { type: 'application/zip' });
      const disposition = response.headers.get('Content-Disposition') || '';
      const filename = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `${project.name || 'project'}.zip`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      await refreshWorkspace(token);
      notify('Project ZIP downloaded and added to My Downloads.');
      return true;
    } catch (cause) {
      setError(cause.message || 'Download failed.');
      return false;
    } finally {
      setDownloadProgress(null);
    }
  };

  const updateProfile = (event) => {
    event.preventDefault();
    run(async () => {
      const updated = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ name: profileName, skills: profileSkills.split(',').map((skill) => skill.trim()).filter(Boolean) }) }, token);
      setUser(updated);
      setProfileSaved(true);
      window.setTimeout(() => setProfileSaved(false), 2400);
    });
  };

  const requestRevival = (project) => run(async () => {
    await api(`/projects/${project.id}/revival-requests`, { method: 'POST', body: JSON.stringify({ message: '' }) }, token);
    notify('Revival request sent to the project owner.');
  });

  const runAnalysis = (project) => run(async () => {
    const updated = await api(`/projects/${project.id}/analyse`, { method: 'POST' }, token);
    setSelected(updated);
    await refreshWorkspace(token);
    notify('Project analysis is complete.');
  });

  const createRoadmap = (project) => run(async () => {
    if (!project.analysis?.generated_at) await api(`/projects/${project.id}/analyse`, { method: 'POST' }, token);
    const updated = await api(`/projects/${project.id}/roadmap`, { method: 'POST', body: JSON.stringify({ direction: roadmapChoice }) }, token);
    setSelected(updated);
    await refreshWorkspace(token);
    notify('Revival roadmap created from project analysis.');
  });

  const runAiDoctor = (project) => run(async () => {
    const review = await api(`/projects/${project.id}/ai/doctor`, { method: 'POST' }, token);
    setSelected({ ...project, ai_review: review });
    notify('AI project review completed.');
  });

  const executeCanvasAction = async (zoneId, project) => {
    if (!project || actionInFlight.current) return;
    actionInFlight.current = true;
    setCanvasStatus((current) => ({ ...current, [zoneId]: { state: 'loading', project: project.name, message: '' } }));
    let success = false;
    try {
      if (zoneId === 'delete' && !window.confirm(`Delete "${project.name}" and its saved project data? This cannot be undone.`)) {
        setCanvasStatus((current) => ({ ...current, [zoneId]: { state: 'cancelled', project: project.name, message: 'Deletion cancelled.' } }));
        return;
      }
      if (zoneId === 'download') success = await downloadProject(project);
      if (zoneId === 'analyse') success = await runAnalysis(project);
      if (zoneId === 'roadmap') success = await createRoadmap(project);
      if (zoneId === 'review') success = await runAiDoctor(project);
      if (zoneId === 'request') success = projects.some((item) => item.id === project.id) ? await openProject(project) : await requestRevival(project);
      if (zoneId === 'notes') success = await openProject(project);
      if (zoneId === 'delete') success = await deleteProject(project);
      setCanvasStatus((current) => ({ ...current, [zoneId]: { state: success ? 'success' : 'error', project: project.name, message: success ? 'Completed' : 'Operation failed; check the error notice.' } }));
    } finally {
      actionInFlight.current = false;
      setActiveCanvasZone(null);
    }
  };

  const handleDragStart = (event, project) => {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/revive-project', project.id);
    event.dataTransfer.setData('text/plain', project.id);
    setDraggedCard(project.id);
    setCanvasStatus((current) => ({ ...current, activeProject: project.id }));
  };

  const handleCanvasDrop = (event, zoneId) => {
    event.preventDefault();
    const projectId = event.dataTransfer.getData('application/revive-project') || event.dataTransfer.getData('text/plain') || draggedCard;
    const project = [...projects, ...discovered].find((item) => item.id === projectId);
    setDraggedCard(null);
    if (!project) {
      setCanvasStatus((current) => ({ ...current, [zoneId]: { state: 'error', message: 'Drop a valid project card into this zone.' } }));
      setActiveCanvasZone(null);
      return;
    }
    void executeCanvasAction(zoneId, project);
  };

  const sendAiMessage = (event, project) => {
    event.preventDefault();
    const message = chatText.trim();
    if (!message || shartiBusy) return;
    setShartiBusy(true);
    setShartiError('');
    api(`/projects/${project.id}/ai/chat`, { method: 'POST', body: JSON.stringify({ message }) }, token).then((answer) => {
      setChatMessages((current) => [...current, { role: 'user', content: message, created: new Date().toISOString() }, answer]);
      setChatText('');
      setShartiProjectId(project.id);
      if (answer.proposal) setShartiProposals((current) => [answer.proposal, ...current.filter((item) => item.id !== answer.proposal.id)]);
      notify('SHARTI response received.');
    }).catch((cause) => {
      setShartiError(cause.message || 'SHARTI could not answer.');
      setError(cause.message || 'SHARTI could not answer.');
    }).finally(() => setShartiBusy(false));
  };

  const approveShartiProposal = async (proposal) => {
    if (!proposal || shartiBusy || !shartiProjectId) return;
    setShartiBusy(true);
    setProposalStatus((current) => ({ ...current, [proposal.id]: 'applying' }));
    setShartiError('');
    try {
      const updated = await api(`/projects/${shartiProjectId}/ai/proposals/${proposal.id}/apply`, { method: 'POST' }, token);
      setSelected((current) => current?.id === shartiProjectId ? updated : current);
      await refreshWorkspace(token);
      setShartiProposals((current) => current.filter((item) => item.id !== proposal.id));
      setVersions(await api(`/projects/${shartiProjectId}/versions`, {}, token));
      setProposalStatus((current) => ({ ...current, [proposal.id]: 'applied' }));
      notify(`Approved changes saved as project version ${updated.archive_path ? 'with rollback available' : ''}.`);
    } catch (cause) {
      setProposalStatus((current) => ({ ...current, [proposal.id]: 'error' }));
      setShartiError(cause.message || 'The approved changes could not be applied.');
      setError(cause.message || 'The approved changes could not be applied.');
    } finally {
      setShartiBusy(false);
    }
  };

  const rejectShartiProposal = async (proposal) => {
    if (!proposal || shartiBusy || !shartiProjectId) return;
    setShartiBusy(true);
    setProposalStatus((current) => ({ ...current, [proposal.id]: 'rejecting' }));
    try {
      await api(`/projects/${shartiProjectId}/ai/proposals/${proposal.id}`, { method: 'DELETE' }, token);
      setShartiProposals((current) => current.filter((item) => item.id !== proposal.id));
      setProposalStatus((current) => ({ ...current, [proposal.id]: 'rejected' }));
    } catch (cause) {
      setError(cause.message || 'The proposal could not be rejected.');
    } finally {
      setShartiBusy(false);
    }
  };

  const handleApplyChangesDrop = (event) => {
    event.preventDefault();
    const proposalId = event.dataTransfer.getData('application/revive-proposal');
    const proposal = shartiProposals.find((item) => item.id === proposalId);
    if (!proposal) {
      setShartiError('Drop one of SHARTI’s proposal cards here to approve it.');
      return;
    }
    void approveShartiProposal(proposal);
  };

  const selectShartiProject = async (projectId) => {
    setShartiProjectId(projectId);
    setChatMessages([]);
    setShartiProposals([]);
    setShartiError('');
    if (!projectId) return;
    try {
      const [messages, proposals] = await Promise.all([
        api(`/projects/${projectId}/ai/messages`, {}, token),
        api(`/projects/${projectId}/ai/proposals`, {}, token),
      ]);
      setChatMessages(messages);
      setShartiProposals(proposals);
    } catch (cause) {
      setShartiError(cause.message || 'Could not load this project’s SHARTI history.');
    }
  };

  const updateTask = (project, task, done) => run(async () => {
    const updated = await api(`/projects/${project.id}/tasks/${task.id}`, { method: 'PATCH', body: JSON.stringify({ done }) }, token);
    setSelected(updated);
    await refreshWorkspace(token);
  });

  const saveNotes = (project) => run(async () => {
    const updated = await api(`/projects/${project.id}/notes`, { method: 'PATCH', body: JSON.stringify({ notes }) }, token);
    setSelected(updated);
    notify('Project notes saved.');
  });

  const inspectFile = (project, file) => run(async () => {
    setInspect(await api(`/projects/${project.id}/files/${file.id}`, {}, token));
  });

  const deleteProject = (project) => run(async () => {
      await api(`/projects/${project.id}`, { method: 'DELETE' }, token);
      await refreshWorkspace(token);
      setSelected(null);
      setPage('uploads');
      notify('Project deleted.');
    });

  const uploadVersion = (event, project) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    if (!(file instanceof File) || !file.size || !file.name.toLowerCase().endsWith('.zip') || file.size > 15 * 1024 * 1024) {
      setError('Choose a ZIP file no larger than 15 MB.');
      return;
    }
    run(async () => {
      await api(`/projects/${project.id}/versions`, { method: 'POST', body: data }, token);
      setVersions(await api(`/projects/${project.id}/versions`, {}, token));
      setSelected(await api(`/projects/${project.id}`, {}, token));
      form.reset();
      notify('New project version saved.');
    });
  };

  const decideRequest = (project, requestId, status) => run(async () => {
    await api(`/projects/${project.id}/revival-requests/${requestId}`, { method: 'PATCH', body: JSON.stringify({ status }) }, token);
    const [requests, projectMembers, projectMatches] = await Promise.all([
      api(`/projects/${project.id}/revival-requests`, {}, token),
      api(`/projects/${project.id}/members`, {}, token),
      api(`/projects/${project.id}/matches`, {}, token),
    ]);
    setRevivalRequests(requests);
    setMembers(projectMembers.map((member) => ({ ...member, skills: JSON.parse(member.skills) })));
    setMatches(projectMatches);
    notify(`Request ${status.toLowerCase()}.`);
  });

  const assignTask = (project, task, userId) => run(async () => {
    const updated = await api(`/projects/${project.id}/tasks/${task.id}/assign`, { method: 'PATCH', body: JSON.stringify({ assignee_user_id: userId || null }) }, token);
    setSelected(updated);
    notify(userId ? 'Task assigned to a collaborator.' : 'Task assignment removed.');
  });

  const downloadVersion = async (project, version) => {
    try {
      const response = await fetch(`${API}/projects/${project.id}/versions/${version}/download`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || 'Version download failed.');
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `revive-${project.id.slice(0, 8)}-v${version}.zip`;
      anchor.click();
      URL.revokeObjectURL(url);
      notify(`Version ${version} downloaded.`);
    } catch (cause) {
      setError(cause.message);
    }
  };

  const isOwner = selected && projects.some((project) => project.id === selected.id);
  const technologies = [...new Set(discovered.flatMap((project) => project.technologies || []))].sort();

  if (sessionLoading) return <div className="session-screen"><LoaderCircle className="spin" size={27} /><span>Opening your workspace</span></div>;
  if (!token || !user) {
    return <AuthScreen
      mode={authMode}
      setMode={setAuthMode}
      form={authForm}
      setForm={setAuthForm}
      submit={submitAuth}
      busy={busy}
      error={error}
      setError={setError}
    />;
  }

  const navItems = [
    { id: 'overview', label: 'Overview', icon: Gauge },
    { id: 'discover', label: 'Discover projects', icon: Compass },
    { id: 'uploads', label: 'My uploads', icon: FolderKanban, count: projects.length },
    { id: 'downloads', label: 'My downloads', icon: ArrowDownToLine, count: downloads.length },
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <a className="brand" href="#overview" onClick={(event) => { event.preventDefault(); setPage('overview'); }}>
          <span className="brand-mark"><Activity size={21} strokeWidth={2.5} /></span>
          <span className="brand-word">REVIVE<span>OS</span><small>PROJECT EXCHANGE</small></span>
          <button className="icon-button mobile-close" type="button" aria-label="Close navigation" onClick={() => setMobileNav(false)}><X size={18} /></button>
        </a>
        <div className="sidebar-caption">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          {navItems.map(({ id, label, icon: Icon, count }) => (
            <button className={`nav-item ${page === id ? 'nav-active' : ''}`} key={id} onClick={() => { setPage(id); setMobileNav(false); }}>
              <Icon size={18} /><span>{label}</span>{count > 0 && <small>{count}</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-prompt"><Sparkles size={16} /><span>Keep good ideas moving.</span></div>
          <button className={`profile-shortcut ${page === 'profile' ? 'nav-active' : ''}`} onClick={() => { setPage('profile'); setMobileNav(false); }}>
            <span className="user-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
            <span className="profile-shortcut-text"><b>{user.name}</b><small>Account settings</small></span>
            <Settings2 size={16} />
          </button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileNav(true)}><Menu size={20} /></button>
          <div className="crumb"><span>REVIVE OS</span><span className="crumb-slash">/</span>{pageLabel(page)}</div>
          <div className="topbar-actions">
            <button className="top-search" onClick={() => setPage('discover')}><Search size={16} /><span>Find a project</span><kbd>/</kbd></button>
            <span className="top-divider" />
            <button className="icon-button notification-button" aria-label="Recent activity" title="Recent activity" onClick={() => setPage('overview')}><Bell size={18} /><i /></button>
            <button className="top-user" onClick={() => setPage('profile')}><span className="user-avatar">{user.name.slice(0, 1).toUpperCase()}</span><ChevronDown size={14} /></button>
            <button className="icon-button signout-button" title="Sign out" aria-label="Sign out" onClick={logout}><LogOut size={17} /></button>
          </div>
        </header>

        <div className="page-content">
          {error && <div className="notice notice-error" role="alert"><ShieldCheck size={17} /><span>{error}</span><button className="icon-button" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
          {page === 'overview' && <Overview user={user} stats={stats} projects={projects} activity={activity} openProject={openProject} setPage={setPage} onDragStart={handleDragStart} onDrop={handleCanvasDrop} activeZone={activeCanvasZone} setActiveZone={setActiveCanvasZone} canvasStatus={canvasStatus} shartiProjectId={shartiProjectId} setShartiProjectId={selectShartiProject} chatMessages={chatMessages} chatText={chatText} setChatText={setChatText} sendAiMessage={sendAiMessage} shartiBusy={shartiBusy} aiStatus={aiStatus} />}
          {page === 'discover' && <Discover projects={discovered} query={query} setQuery={setQuery} category={category} setCategory={setCategory} technology={technology} setTechnology={setTechnology} technologies={technologies} search={searchProjects} openProject={openProject} download={downloadProject} progress={downloadProgress} setPage={setPage} />}
          {page === 'uploads' && <ProjectCollection title="My uploads" eyebrow="YOUR CONTRIBUTIONS" description="Projects you have shared with the community." projects={projects} openProject={openProject} download={downloadProject} progress={downloadProgress} emptyAction={() => setPage('upload')} emptyLabel="Share your first project" />}
          {page === 'downloads' && <Downloads items={downloads} openProject={openProject} download={downloadProject} progress={downloadProgress} setPage={setPage} />}
          {page === 'upload' && <UploadWorkspace busy={busy} progress={uploadProgress} submit={uploadProject} mode={uploadMode} setMode={setUploadMode} goBack={() => setPage('overview')} />}
          {page === 'project' && selected && <><ProjectWorkspace project={selected} owner={isOwner} busy={busy} downloadProgress={downloadProgress} download={downloadProject} requestRevival={requestRevival} runAnalysis={runAnalysis} roadmapChoice={roadmapChoice} setRoadmapChoice={setRoadmapChoice} createRoadmap={createRoadmap} back={() => setPage(previousPage)} notes={notes} setNotes={setNotes} saveNotes={saveNotes} updateTask={updateTask} inspectFile={inspectFile} revivalRequests={revivalRequests} deleteProject={deleteProject} /><ProjectFeatures project={selected} owner={Boolean(isOwner)} busy={busy} runAiDoctor={runAiDoctor} versions={versions} uploadVersion={uploadVersion} downloadVersion={downloadVersion} requests={revivalRequests} decideRequest={decideRequest} matches={matches} members={members} assignTask={assignTask} updateTask={updateTask} chatMessages={chatMessages} chatText={chatText} setChatText={setChatText} sendAiMessage={sendAiMessage} createRoadmap={createRoadmap} roadmapChoice={roadmapChoice} setRoadmapChoice={setRoadmapChoice} /></>}
          {page === 'profile' && <><Profile user={user} name={profileName} setName={setProfileName} submit={updateProfile} busy={busy} saved={profileSaved} logout={logout} /><ProfileSkillsEditor skills={profileSkills} setSkills={setProfileSkills} submit={updateProfile} busy={busy} /></>}
        </div>
      </main>
      {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
      {shartiOpen && <ShartiWorkspace projects={projects} projectId={shartiProjectId} selectProject={selectShartiProject} messages={chatMessages} chatText={chatText} setChatText={setChatText} sendMessage={(event) => sendAiMessage(event, projects.find((item) => item.id === shartiProjectId))} busy={shartiBusy} error={shartiError} aiStatus={aiStatus} proposals={shartiProposals} proposalStatus={proposalStatus} onReject={rejectShartiProposal} onApplyDrop={handleApplyChangesDrop} onClose={() => setShartiOpen(false)} />}
      <button type="button" className="sharti-avatar" aria-label="Open SHARTI AI" title="Drag to move · click to open" style={{ left: avatarPosition.x, top: avatarPosition.y }} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); avatarDrag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: avatarPosition.x, top: avatarPosition.y, moved: false }; }} onPointerMove={(event) => { const drag = avatarDrag.current; if (!drag || drag.id !== event.pointerId) return; const dx = event.clientX - drag.x; const dy = event.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; setAvatarPosition({ x: Math.max(8, Math.min(window.innerWidth - 68, drag.left + dx)), y: Math.max(8, Math.min(window.innerHeight - 68, drag.top + dy)) }); }} onPointerUp={(event) => { const drag = avatarDrag.current; if (drag && drag.id === event.pointerId && !drag.moved) setShartiOpen((current) => !current); avatarDrag.current = null; }}><span className="sharti-avatar-aura" /><Bot size={24} /><small>SHARTI</small></button>
      {inspect && <div className="modal-backdrop" onClick={() => setInspect(null)}><section className="source-modal" onClick={(event) => event.stopPropagation()}><div className="source-modal-head"><div><span className="eyebrow">SOURCE FILE</span><h2>{inspect.path}</h2></div><button className="icon-button" aria-label="Close source preview" onClick={() => setInspect(null)}><X size={18} /></button></div><pre>{inspect.content || 'No readable text is available for this file.'}</pre><small>{inspect.size.toLocaleString()} bytes · read only</small></section></div>}
      {toast && <div className={`toast toast-${toast.kind}`} role="status"><CheckCircle2 size={18} /><span>{toast.message}</span><button className="icon-button" aria-label="Dismiss message" onClick={() => setToast(null)}><X size={15} /></button></div>}
    </div>
  );
}

function AuthScreen({ mode, setMode, form, setForm, submit, busy, error, setError }) {
  const signup = mode === 'signup';
  return (
    <div className="auth-screen">
      <div className="auth-left">
        <div className="auth-brand"><span className="brand-mark"><Activity size={22} /></span><span className="brand-word">REVIVE<span>OS</span></span></div>
        <div className="auth-message">
          <div className="eyebrow"><span className="eyebrow-mark" /> THE PROJECT EXCHANGE</div>
          <h1>Good work<br />doesn't have<br /><em>an expiry date.</em></h1>
          <p>Find unfinished projects with real potential. Share what you started. Help someone take it further.</p>
          <div className="auth-proof"><span><FolderKanban size={16} /> Open source spirit</span><span><ShieldCheck size={16} /> Account protected</span></div>
        </div>
        <span className="auth-coordinate">A COMMUNITY FOR WHAT COMES NEXT</span>
      </div>
      <div className="auth-right">
        <div className="auth-card-wrap">
          <div className="auth-mobile-brand"><span className="brand-mark"><Activity size={20} /></span><span className="brand-word">REVIVE<span>OS</span></span></div>
          <div className="auth-heading"><span className="eyebrow">{signup ? 'JOIN THE COMMUNITY' : 'YOUR WORKSPACE AWAITS'}</span><h2>{signup ? 'Create your account' : 'Welcome back'}</h2><p>{signup ? 'A fresh start for the work worth saving.' : 'Sign in to pick up where you left off.'}</p></div>
          {error && <div className="notice notice-error auth-error" role="alert"><span>{error}</span><button className="icon-button" onClick={() => setError('')} aria-label="Dismiss"><X size={15} /></button></div>}
          <form className="auth-form" onSubmit={submit}>
            {signup && <label>Your name<input autoComplete="name" required minLength="1" maxLength="100" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Alex Morgan" /></label>}
            <label>Email address<input type="email" autoComplete="email" required maxLength="254" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="you@example.com" /></label>
            <label>Password<input type="password" autoComplete={signup ? 'new-password' : 'current-password'} required minLength="8" maxLength="128" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder="At least 8 characters" /></label>
            <button className="button-primary auth-submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : signup ? 'Create account' : 'Sign in'}<ArrowRight size={17} /></button>
          </form>
          <div className="auth-switch">{signup ? 'Already have an account?' : 'New to REVIVE OS?'} <button onClick={() => { setError(''); setMode(signup ? 'login' : 'signup'); }}> {signup ? 'Sign in' : 'Create an account'}</button></div>
          <div className="auth-legal">By continuing, you agree to keep shared projects useful, respectful, and safe to download.</div>
        </div>
      </div>
    </div>
  );
}

function CanvasActionBoard({ projects, openProject, onDragStart, onDrop, activeZone, setActiveZone, status }) {
  const zones = [
    { id: 'download', title: 'Download', description: 'Save the project archive to your library.', icon: Download },
    { id: 'analyse', title: 'Analyse', description: 'Scan indexed files for readiness and blockers.', icon: Activity },
    { id: 'roadmap', title: 'Roadmap', description: 'Build milestones from the project analysis.', icon: Route },
    { id: 'review', title: 'AI Review', description: 'Request an evidence-based code review.', icon: ShieldCheck },
    { id: 'request', title: 'Collaborate', description: 'Open collaboration or request to join.', icon: Handshake },
    { id: 'notes', title: 'Notes', description: 'Open the project workspace and recovery notes.', icon: NotebookPen },
    { id: 'delete', title: 'Delete', description: 'Permanently remove an owned project.', icon: Trash2 },
  ];
  return <section className="canvas-panel" aria-label="The Canvas Protocol"><div className="canvas-heading"><div><span className="eyebrow">THE CANVAS PROTOCOL</span><h2>Move a project into an action</h2></div><span className="canvas-count">{projects.length} PROJECTS</span></div><div className="canvas-projects">{projects.length ? projects.map((project) => <article className="canvas-project" key={project.id} draggable onDragStart={(event) => onDragStart(event, project)} onDragEnd={() => setActiveZone(null)} onClick={() => openProject(project)} onKeyDown={(event) => event.key === 'Enter' && openProject(project)} tabIndex="0" role="button" aria-label={`Drag ${project.name} into an action zone or open details`}><div className="canvas-project-head"><span className="canvas-grip"><Move size={15} /></span><StatusPill status={project.status} /></div><h3>{project.name}</h3><p>{project.description || 'Project archive ready for recovery.'}</p><div className="canvas-project-meta"><span>{project.category || 'Other'}</span><span><Files size={13} /> {project.file_stats?.total_files ?? project.files?.length ?? 0} files</span></div></article>) : <div className="canvas-empty"><FolderKanban size={20} /><span>Your uploaded projects appear here.</span></div>}</div><div className="canvas-zone-grid">{zones.map(({ id, title, description, icon: Icon }) => { const state = status[id] || {}; return <div key={id} className={`canvas-zone ${activeZone === id ? 'canvas-zone-active' : ''} ${state.state ? `canvas-zone-${state.state}` : ''} ${id === 'delete' ? 'canvas-zone-danger' : ''}`} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setActiveZone(id); }} onDragEnter={() => setActiveZone(id)} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setActiveZone(null); }} onDrop={(event) => onDrop(event, id)} aria-label={`${title} action drop zone`}><span className="canvas-zone-icon"><Icon size={19} /></span><span className="canvas-zone-copy"><strong>{title}</strong><small>{state.message || description}</small></span><span className="canvas-zone-state">{state.state === 'loading' ? <LoaderCircle className="spin" size={17} /> : state.state === 'success' ? <CheckCircle2 size={17} /> : state.state === 'error' ? <X size={17} /> : <ArrowDownToLine size={16} />}</span></div>; })}</div></section>;
}

function OverviewCharts({ stats, activity }) {
  const history = stats.progress_history || [];
  const languages = Object.entries(stats.languages || {}).filter(([, count]) => count > 0).map(([name, value]) => ({ name, value }));
  const colors = ['#50dfd0', '#7caeff', '#b7e474', '#ffae6b', '#da8cff', '#ff7e81', '#72c9ff', '#b6c3c7'];
  const formatDate = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  return <div className="overview-graphs">
    <section className="insight-panel graph-panel progress-graph"><div className="insight-heading"><div><span className="eyebrow">DEVELOPMENT HISTORY</span><h2>Your Progress</h2></div><span className="insight-total">{history.length} EVENTS</span></div><div className="graph-metrics"><span><CheckCircle2 size={15} /> <b>{stats.completed_tasks || 0}</b> completed tasks</span><span><Clock3 size={15} /> <b>{stats.pending_tasks || 0}</b> pending tasks</span></div>{history.length ? <div className="chart-frame"><ResponsiveContainer width="100%" height="100%"><AreaChart data={history} margin={{ top: 12, right: 14, left: -20, bottom: 2 }}><defs><linearGradient id="progressFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#50dfd0" stopOpacity={0.36} /><stop offset="95%" stopColor="#50dfd0" stopOpacity={0.015} /></linearGradient></defs><CartesianGrid stroke="#24363c" strokeDasharray="3 5" vertical={false} /><XAxis dataKey="created" tickFormatter={formatDate} minTickGap={24} tick={{ fill: '#91a3a8', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tickFormatter={(value) => `${value}%`} tick={{ fill: '#91a3a8', fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={(label) => new Date(label).toLocaleString()} formatter={(value, name) => [`${value}%`, name]} contentStyle={{ background: '#101a20', border: '1px solid #345057', borderRadius: 5, color: '#e8f0f4' }} /><Area type="monotone" dataKey="completion" name="Project completion" stroke="#50dfd0" strokeWidth={2.5} fill="url(#progressFill)" activeDot={{ r: 5, fill: '#a6fff1', stroke: '#0b1519', strokeWidth: 2 }} /></AreaChart></ResponsiveContainer></div> : <div className="graph-empty"><Activity size={21} /><b>Progress history starts with your next project update</b><span>Existing projects without recorded events aren’t assigned invented data.</span></div>}<div className="graph-activity"><span className="eyebrow">RECENT DEVELOPMENT ACTIVITY</span>{activity.length ? activity.slice(0, 3).map((item) => <div className="graph-activity-row" key={`${item.kind}-${item.project_id}-${item.created}`}><span>{item.kind === 'download' ? 'Downloaded' : item.kind === 'upload' ? 'Uploaded' : 'Updated'} <b>{item.project_name}</b></span><time>{timeAgo(item.created)}</time></div>) : <p className="empty-copy">No project activity yet.</p>}</div></section>
    <section className="insight-panel graph-panel project-graph">
      <div className="insight-heading">
        <div><span className="eyebrow">SOURCE COMPOSITION</span><h2>Project Analytics</h2></div>
        <span className="insight-total">{stats.files || 0} FILES</span>
      </div>
      {languages.length ? <>
        <div className="donut-layout">
          <div className="donut-frame">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={languages} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="82%" paddingAngle={3} stroke="#10191e" strokeWidth={3}>
                  {languages.map((item, index) => <Cell key={item.name} fill={colors[index % colors.length]} />)}
                </Pie>
                <Tooltip formatter={(value, name) => [`${value} file${value === 1 ? '' : 's'}`, name]} contentStyle={{ background: '#101a20', border: '1px solid #345057', borderRadius: 5, color: '#e8f0f4' }} />
                <Legend verticalAlign="bottom" height={34} iconType="circle" formatter={(value) => <span className="chart-legend-label">{value}</span>} />
              </PieChart>
            </ResponsiveContainer>
            <div className="donut-center"><b>{stats.files || 0}</b><small>indexed files</small></div>
          </div>
          <div className="language-counts">
            {languages.map((item, index) => <div className="language-count-row" key={item.name}><i style={{ background: colors[index % colors.length] }} /><span>{item.name}</span><b>{item.value}</b></div>)}
          </div>
        </div>
        <div className="composition-foot">
          <span>{stats.uploads || 0} projects</span>
          <span>{Object.keys(stats.technologies || {}).length} technologies</span>
          <span>{formatBytes(stats.bytes || 0)}</span>
        </div>
      </> : <div className="graph-empty"><Files size={21} /><b>No indexed files to chart</b><span>Upload a project ZIP to see language distribution and project composition.</span></div>}
    </section>
  </div>;
}

function Overview({ user, stats, projects, activity, openProject, setPage, onDragStart, onDrop, activeZone, setActiveZone, canvasStatus, shartiProjectId, setShartiProjectId, chatMessages, chatText, setChatText, sendAiMessage, shartiBusy, aiStatus }) {
  const languageEntries = Object.entries(stats.languages || {}).sort((a, b) => b[1] - a[1]);
  const technologyEntries = Object.entries(stats.technologies || {}).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const statusEntries = Object.entries(stats.statuses || {}).sort((a, b) => b[1] - a[1]);
  const maxLanguage = Math.max(1, ...languageEntries.map(([, count]) => count));
  return <div className="overview-page">
    <section className="welcome-band"><div className="welcome-copy"><span className="eyebrow"><span className="eyebrow-mark" /> YOUR PROJECT EXCHANGE</span><h1>Make something<br /><em>move forward.</em></h1><p>Good work deserves another chapter. Your uploaded projects and their real file inventory are gathered here.</p><div className="welcome-actions"><button className="button-primary" onClick={() => setPage('discover')}><Compass size={17} /> Explore projects <ArrowRight size={16} /></button><button className="button-secondary" onClick={() => setPage('upload')}><Plus size={17} /> Share a project</button></div></div><div className="welcome-art" aria-hidden="true"><div className="art-ring ring-one" /><div className="art-ring ring-two" /><div className="art-core"><Activity size={48} strokeWidth={1.4} /></div><span className="art-label">IDEA IN MOTION</span></div></section>
    <div className="section-head"><div><span className="eyebrow">YOUR MOMENTUM</span><h2>Workspace overview</h2></div><span className="quiet-label">Good to see you, {user.name.split(' ')[0]}</span></div>
    <div className="stats-grid"><StatCard label="Uploaded projects" value={stats.uploads || 0} note="Owned projects" icon={FolderKanban} color="cyan" /><StatCard label="Indexed files" value={stats.files || 0} note={`${formatBytes(stats.bytes || 0)} source data`} icon={Files} color="blue" /><StatCard label="Active revivals" value={stats.active || 0} note="Project status" icon={Activity} color="lime" /><StatCard label="Downloads" value={stats.downloads || 0} note="Saved to your library" icon={Download} color="orange" /></div>
    <CanvasActionBoard projects={projects} openProject={openProject} onDragStart={onDragStart} onDrop={onDrop} activeZone={activeZone} setActiveZone={setActiveZone} status={canvasStatus} />
    <div className="overview-insights"><section className="insight-panel language-panel"><div className="insight-heading"><div><span className="eyebrow">SOURCE INVENTORY</span><h2>Languages & files</h2></div><span className="insight-total">{stats.files || 0} FILES</span></div>{languageEntries.length ? <div className="distribution-list">{languageEntries.map(([language, count]) => <div className="distribution-row" key={language}><div><span>{language}</span><b>{count}</b></div><i><span style={{ width: `${Math.max(4, count / maxLanguage * 100)}%` }} /></i></div>)}</div> : <p className="empty-copy">Upload a ZIP to see its indexed file and language breakdown.</p>}</section><section className="insight-panel status-panel"><div className="insight-heading"><div><span className="eyebrow">PROJECT HEALTH</span><h2>Current status</h2></div></div>{statusEntries.length ? <div className="status-breakdown">{statusEntries.map(([label, count]) => <div className="status-breakdown-row" key={label}><StatusPill status={label} /><b>{count}</b><span>project{count === 1 ? '' : 's'}</span></div>)}</div> : <p className="empty-copy">No project status has been recorded.</p>}<div className="technology-summary"><span className="eyebrow">TECHNOLOGIES</span><div>{technologyEntries.length ? technologyEntries.map(([technology, count]) => <span className="technology-item" key={technology}>{technology}<b>{count}</b></span>) : <small>No technology metadata yet.</small>}</div></div></section></div>
    <OverviewCharts stats={stats} activity={activity} />
    <div className="dashboard-columns"><section className="content-section"><div className="section-head section-head-tight"><div><span className="eyebrow">PICK UP THE THREAD</span><h2>Recently shared</h2></div><button className="text-link" onClick={() => setPage('uploads')}>All uploads <ArrowRight size={15} /></button></div>{projects.length ? <div className="compact-list">{projects.slice(0, 5).map((project) => <ProjectRow key={project.id} project={project} open={() => openProject(project)} />)}</div> : <EmptyState icon={FolderKanban} title="Nothing shared yet" copy="Put an unfinished project in motion." action="Share a project" onClick={() => setPage('upload')} />}</section><section className="content-section activity-section"><div className="section-head section-head-tight"><div><span className="eyebrow">LATEST</span><h2>Project activity</h2></div><Clock3 size={17} className="quiet-icon" /></div>{activity.length ? <div className="activity-list">{activity.map((item, index) => <div className="activity-item" key={`${item.kind}-${item.project_id}-${item.created}`}><span className={`activity-icon activity-${item.kind}`}>{item.kind === 'download' ? <Download size={15} /> : item.kind === 'upload' ? <Upload size={15} /> : <Activity size={15} />}</span><div><b>{item.kind === 'download' ? 'Downloaded' : item.kind === 'upload' ? 'Uploaded' : 'Updated'} {item.project_name}</b><small>{timeAgo(item.created)}</small></div><span className="activity-index">{String(index + 1).padStart(2, '0')}</span></div>)}</div> : <p className="empty-copy">Uploads and downloads will appear here.</p>}</section></div>
    <ShartiWorkspace projects={projects} projectId={shartiProjectId} selectProject={setShartiProjectId} messages={chatMessages} chatText={chatText} setChatText={setChatText} sendMessage={(event) => sendAiMessage(event, projects.find((item) => item.id === shartiProjectId))} busy={shartiBusy} error="" aiStatus={aiStatus} proposals={[]} proposalStatus={{}} floating={false} />
  </div>;
}

function ShartiWorkspace({ projects, projectId, selectProject, messages, chatText, setChatText, sendMessage, busy, error, aiStatus, proposals, proposalStatus, onReject, onApplyDrop, floating = false, onClose }) {
  const suggestions = ['What can I improve in this project?', 'Find bugs in the indexed code.', 'Explain the project architecture.', 'Suggest an innovative feature.', 'Improve the frontend experience.', 'How can I complete this abandoned project?'];
  const selectedProject = projects.find((project) => project.id === projectId);
  return <section className={`ai-workspace ${floating ? 'ai-workspace-floating' : ''}`} aria-label="SHARTI AI Workspace"><div className="ai-workspace-heading"><div><span className="eyebrow"><Bot size={14} /> SHARTI AI WORKSPACE</span><h2>Project development assistant</h2><p>{selectedProject ? `Working with ${selectedProject.name} and its indexed source files.` : 'Choose an uploaded project to start a project-specific conversation.'}</p></div><div className="ai-heading-actions"><span className={`ai-status ${aiStatus.configured ? 'ai-ready' : 'ai-unconfigured'}`}>{aiStatus.configured ? `LIVE · ${aiStatus.model}` : 'AI PROVIDER NOT CONFIGURED'}</span>{floating && <button type="button" className="icon-button" aria-label="Close SHARTI" onClick={onClose}><X size={18} /></button>}</div></div>
    <label className="ai-project-select">PROJECT<select value={projectId} onChange={(event) => selectProject(event.target.value)}><option value="">Choose an uploaded project</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    {!aiStatus.configured && <p className="ai-setup-notice" role="status">SHARTI is connected to the backend, but AI chat is unavailable until an AI provider key is configured.</p>}{error && <p className="ai-error" role="alert">{error}</p>}
    <div className="sharti-transcript" aria-live="polite">{messages.length ? messages.map((message, index) => <article className={`sharti-message sharti-${message.role}`} key={`${message.created}-${index}`}><b>{message.role === 'assistant' ? 'SHARTI' : 'You'}</b><ReactMarkdown remarkPlugins={[remarkGfm]} components={{ code({ className, children, ...props }) { const language = className?.replace('language-', ''); const source = String(children).replace(/\n$/, ''); const highlighted = language && hljs.getLanguage(language) ? hljs.highlight(source, { language }).value : null; return highlighted ? <code className={className} dangerouslySetInnerHTML={{ __html: highlighted }} /> : <code className={className} {...props}>{children}</code>; } }}>{message.content}</ReactMarkdown></article>) : <div className="sharti-empty"><MessageSquare size={20} /><p>Ask a question about the selected project or choose a contextual prompt.</p></div>}</div>
    <div className="sharti-suggestions">{suggestions.map((suggestion) => <button type="button" key={suggestion} disabled={!projectId || busy} onClick={() => setChatText(suggestion)}>{suggestion}</button>)}</div>
    {proposals.length > 0 && <section className="sharti-proposals"><div className="proposal-heading"><span className="eyebrow">PROPOSED SOURCE CHANGES</span><span>{proposals.length} awaiting your review</span></div>{proposals.map((proposal) => <article className="sharti-proposal" key={proposal.id} draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/revive-proposal', proposal.id); }}><div className="proposal-card-heading"><FileCode2 size={17} /><b>{proposal.changes.length} file{proposal.changes.length === 1 ? '' : 's'}</b><span>Drag to Apply Changes</span></div>{proposal.changes.map((change) => <details key={`${proposal.id}-${change.path}`}><summary><code>{change.action.toUpperCase()} · {change.path}</code><small>{change.reason}</small></summary><div className="proposal-diff"><pre className="diff-before">{change.before ?? '(new file)'}</pre><pre className="diff-after">{change.after}</pre></div></details>)}<button type="button" className="proposal-reject" disabled={busy || proposalStatus[proposal.id]} onClick={() => onReject(proposal)}>Reject proposal</button></article>)}</section>}
    <div className={`apply-changes-zone ${proposals.length ? 'apply-changes-ready' : ''}`} onDragOver={(event) => { if (event.dataTransfer.types.includes('application/revive-proposal')) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; } }} onDrop={onApplyDrop}><span><CheckCircle2 size={20} /></span><div><b>Apply Changes</b><small>{proposals.length ? 'Drop a reviewed proposal here to approve and save a rollback version.' : 'SHARTI code proposals appear here for explicit drag-to-apply approval.'}</small></div><ArrowDownToLine size={17} /></div>
    <form className="sharti-composer" onSubmit={sendMessage}><textarea value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength="4000" rows="3" disabled={!projectId || busy} placeholder={projectId ? 'Ask about this project or request a code change...' : 'Select a project first'} /><button className="button-primary" disabled={!projectId || busy || !chatText.trim()}>{busy ? <LoaderCircle className="spin" size={17} /> : <Send size={17} />}{busy ? 'Thinking' : 'Send to SHARTI'}</button></form>
  </section>;
}

function Discover({ projects, query, setQuery, category, setCategory, technology, setTechnology, technologies, search, openProject, download, progress, setPage }) {
  return <><PageHeading eyebrow="THE COMMUNITY CATALOG" title="Discover projects" copy="Find an unfinished project that matches your curiosity." action={<button className="button-primary" onClick={() => setPage('upload')}><Plus size={17} /> Share yours</button>} /><form className="discovery-controls" onSubmit={search}><div className="search-field"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects, ideas, or technologies" /><kbd>ENTER</kbd></div><select aria-label="Filter by category" value={category} onChange={(event) => setCategory(event.target.value)}><option>All categories</option>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Filter by technology" value={technology} onChange={(event) => setTechnology(event.target.value)}><option>All technologies</option>{technologies.map((item) => <option key={item}>{item}</option>)}</select><button className="filter-submit" type="submit"><Search size={17} /><span>Search</span></button></form><div className="catalog-meta"><span><b>{projects.length}</b> projects found</span><span className="catalog-live"><i /> COMMUNITY CATALOG</span></div>{projects.length ? <div className="project-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} open={() => openProject(project)} download={() => download(project)} downloading={progress?.id === project.id} />)}</div> : <EmptyState icon={Compass} title="No projects found" copy="Try another search or clear your filters." action="Clear filters" onClick={() => { setQuery(''); setCategory('All categories'); setTechnology('All technologies'); search(); }} />}</>;
}

function ProjectCollection({ title, eyebrow, description, projects, openProject, download, progress, emptyAction, emptyLabel }) {
  return <><PageHeading eyebrow={eyebrow} title={title} copy={description} />{projects.length ? <div className="project-grid">{projects.map((project) => <ProjectCard key={project.id} project={project} open={() => openProject(project)} download={() => download(project)} downloading={progress?.id === project.id} />)}</div> : <EmptyState icon={FolderKanban} title="Your collection is clear" copy="Projects you share will live here." action={emptyLabel} onClick={emptyAction} />}</>;
}

function Downloads({ items, openProject, download, progress, setPage }) {
  return <><PageHeading eyebrow="YOUR PROJECT LIBRARY" title="My downloads" copy="ZIP archives you have successfully downloaded from the exchange." action={<button className="button-secondary" onClick={() => setPage('discover')}><Compass size={16} /> Browse projects</button>} />{items.length ? <div className="download-list">{items.map((item) => <article className="download-row" key={item.id}><span className="download-file-icon"><FileArchive size={22} /></span><div className="download-main"><button className="download-title" onClick={() => openProject(item)}>{item.name}</button><p>{item.description || 'A community project ready for its next chapter.'}</p><div className="project-tags"><span>{item.category}</span>{(item.technologies || []).slice(0, 3).map((tech) => <span key={tech}>{tech}</span>)}</div></div><div className="download-date"><small>DOWNLOADED</small><b>{formatDate(item.downloaded)}</b></div><button className="button-secondary download-again" disabled={progress?.id === item.id} onClick={() => download(item)}>{progress?.id === item.id ? <LoaderCircle className="spin" size={16} /> : <Download size={16} />}<span>{progress?.id === item.id ? `${progress.loaded.toLocaleString()} B` : 'Download again'}</span></button></article>)}</div> : <EmptyState icon={ArrowDownToLine} title="Your download library is empty" copy="Download a project ZIP and it will be kept here for easy access." action="Discover projects" onClick={() => setPage('discover')} />}</>;
}

function UploadPage({ busy, progress, submit, goBack }) {
  return <><button className="back-link" onClick={goBack}><ArrowLeft size={16} /> Back to overview</button><PageHeading eyebrow="CONTRIBUTE TO THE EXCHANGE" title="Share a project" copy="Save your work as a downloadable ZIP and give another developer a starting point." /><form className="upload-layout" onSubmit={submit}><div className="upload-main"><section className="form-panel"><div className="panel-heading"><span className="panel-step">01</span><div><h2>Project details</h2><p>Give the project a clear identity.</p></div></div><label className="field-label">PROJECT TITLE<input name="name" required minLength="2" maxLength="140" placeholder="e.g. Atlas: neighborhood skill exchange" /></label><label className="field-label">DESCRIPTION<textarea name="description" required maxLength="5000" rows="4" placeholder="What does it do? What was working, and what still needs attention?" /></label><div className="field-pair"><label className="field-label">CATEGORY<select name="category" defaultValue="Web App">{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="field-label">COMPLETION<input name="completion" type="number" min="0" max="100" defaultValue="35" /><span className="field-suffix">%</span></label></div><label className="field-label">TECHNOLOGIES<input name="technologies" placeholder="React, FastAPI, PostgreSQL" /><small>Separate technologies with commas.</small></label></section><section className="form-panel archive-panel"><div className="panel-heading"><span className="panel-step">02</span><div><h2>Project archive</h2><p>Upload the actual project ZIP. Maximum size: 15 MB.</p></div></div><label className="file-drop"><input name="file" type="file" accept=".zip,application/zip" required /><span className="file-drop-icon"><Upload size={22} /></span><b>Choose a ZIP archive</b><small>or drop your file here</small><span className="file-drop-note">ZIP only · 15 MB maximum</span></label><div className="upload-safety"><ShieldCheck size={16} /><span>Archive paths and file types are checked on the server before saving.</span></div>{progress !== null && <div className="upload-progress"><div><span>Uploading archive</span><b>{progress}%</b></div><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div>}</section></div><aside className="upload-aside"><div className="publish-note"><span className="publish-icon"><Sparkles size={18} /></span><h3>Make room for the next builder.</h3><p>Your upload will appear in community discovery and can be downloaded as a ZIP by other signed-in developers.</p><div className="publish-rule" /><div className="publish-check"><Check size={15} /> Saved to your uploads</div><div className="publish-check"><Check size={15} /> Visible in discovery</div><div className="publish-check"><Check size={15} /> Download count tracked</div></div><button className="button-primary publish-button" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <Upload size={17} />}{busy ? 'Saving project...' : 'Save and publish'}<ArrowRight size={16} /></button></aside></form></>;
}

function ProjectDetail({ project, owner, busy, downloadProgress, download, requestRevival, runAnalysis, roadmapChoice, setRoadmapChoice, createRoadmap }) {
  const isDownloading = downloadProgress?.id === project.id;
  return <><button className="back-link" onClick={() => window.history.length > 1 ? window.history.back() : null}><ArrowLeft size={16} /> Project workspace</button><div className="detail-heading"><div><span className="eyebrow">{project.category || 'COMMUNITY PROJECT'} <span className="eyebrow-divider">/</span> {project.source || 'shared'}</span><h1>{project.name}</h1><p>{project.description || 'A project waiting for its next chapter.'}</p></div><StatusPill status={project.status} /></div><div className="detail-overview"><div className="detail-primary"><div className="detail-tags"><span className="category-tag">{project.category}</span>{(project.technologies || []).map((tech) => <span key={tech}>{tech}</span>)}</div><div className="detail-progress"><div className="progress-label"><span>Reported completion</span><b>{project.completion ?? 0}%</b></div><div className="progress-track"><i style={{ width: `${project.completion ?? 0}%` }} /></div></div><div className="detail-metrics"><div><b>{project.download_count || 0}</b><small>DOWNLOADS</small></div><div><b>{project.files?.length ?? '—'}</b><small>READABLE FILES</small></div><div><b>{project.progress ?? 0}%</b><small>ROADMAP PROGRESS</small></div></div></div><aside className="detail-action-panel"><span className="eyebrow">TAKE IT FURTHER</span><p>{owner ? 'Your project is available to the community.' : 'Bring this project into your local workspace and start building.'}</p><button className="button-primary full-button" disabled={isDownloading} onClick={() => download(project)}>{isDownloading ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}{isDownloading ? downloadProgress.total ? `${Math.round(downloadProgress.loaded / downloadProgress.total * 100)}% downloaded` : `${(downloadProgress.loaded / 1024 / 1024).toFixed(1)} MB received` : 'Download project ZIP'}{!isDownloading && <ArrowDownToLine size={17} />}</button>{!owner && <button className="button-secondary full-button" disabled={busy} onClick={() => requestRevival(project)}><Zap size={16} /> Request to collaborate</button>}</aside></div>{project.analysis?.generated_at && <section className="detail-section"><div className="section-head"><div><span className="eyebrow">PROJECT AUTOPSY</span><h2>Readiness estimate <span className="score">{project.analysis.score}<small>/100</small></span></h2></div>{owner && <button className="button-secondary" disabled={busy} onClick={() => runAnalysis(project)}><Activity size={16} /> Run analysis again</button>}</div><p className="analysis-note">{project.analysis.method}</p><div className="finding-grid">{(project.analysis.findings || []).map((finding, index) => <div className={`finding ${finding.kind}`} key={`${finding.title}-${index}`}><span>{finding.kind === 'warning' ? '!' : <Check size={15} />}</span><div><b>{finding.title}</b><p>{finding.detail}</p></div></div>)}</div></section>}{owner && <section className="detail-section roadmap-section"><div className="section-head"><div><span className="eyebrow">REVIVAL WORKSPACE</span><h2>Project roadmap</h2></div><div className="roadmap-actions"><select value={roadmapChoice} onChange={(event) => setRoadmapChoice(event.target.value)}>{['Continue', 'Restart', 'Pivot', 'Repurpose', 'Archive'].map((choice) => <option key={choice}>{choice}</option>)}</select><button className="button-secondary" disabled={busy || !project.analysis?.generated_at} onClick={() => createRoadmap(project)}><Sparkles size={16} /> Generate roadmap</button></div></div>{project.tasks?.length ? <div className="roadmap-list">{project.tasks.map((task, index) => <div className={`roadmap-item ${task.done ? 'roadmap-done' : ''}`} key={task.id}><span className="roadmap-index">{String(index + 1).padStart(2, '0')}</span><span className="roadmap-check">{task.done ? <Check size={14} /> : null}</span><div><b>{task.title}</b><p>{task.detail}</p></div><span className="priority-tag">{task.priority}</span></div>)}</div> : <div className="roadmap-empty"><p>Run an autopsy, then generate a practical first set of milestones.</p><button className="button-secondary" disabled={busy} onClick={() => runAnalysis(project)}><Activity size={16} /> Run project autopsy</button></div>}</section>}</>;
}

function Profile({ user, name, setName, submit, busy, saved, logout }) {
  return <><PageHeading eyebrow="ACCOUNT & SECURITY" title="Your profile" copy="Manage the identity attached to your REVIVE OS account." /><div className="profile-layout"><section className="form-panel profile-form-panel"><div className="panel-heading"><span className="profile-large-avatar">{user.name.slice(0, 1).toUpperCase()}</span><div><h2>Personal details</h2><p>Your account information is private.</p></div></div><form onSubmit={submit}><label className="field-label">DISPLAY NAME<input required minLength="1" maxLength="100" value={name} onChange={(event) => setName(event.target.value)} /></label><label className="field-label">EMAIL ADDRESS<input type="email" value={user.email} disabled /><small>Email changes are not available yet.</small></label><div className="profile-foot"><span className="profile-created">Member since {formatDate(user.created)}</span><button className="button-primary" disabled={busy}>{saved ? <Check size={16} /> : null}{saved ? 'Saved' : busy ? 'Saving...' : 'Save profile'}</button></div></form></section><aside className="security-panel"><ShieldCheck size={21} /><h3>Session security</h3><p>Your password is stored as a salted PBKDF2 hash. Signing out revokes this session on the server.</p><button className="button-secondary" onClick={logout}><LogOut size={16} /> Sign out of REVIVE OS</button></aside></div></>;
}

function UploadWorkspace({ busy, progress, submit, mode, setMode, goBack }) {
  return <><button className="back-link" onClick={goBack}><ArrowLeft size={16} /> Back to overview</button><PageHeading eyebrow="CONTRIBUTE TO THE EXCHANGE" title="Share a project" copy="Save your work as a downloadable project and give another developer a starting point." /><div className="upload-tabs" role="tablist" aria-label="Project import method">{[['zip','ZIP archive'],['github','GitHub repository'],['manual','Project context']].map(([value,label])=><button type="button" role="tab" aria-selected={mode===value} className={mode===value?'upload-tab-active':''} key={value} onClick={()=>setMode(value)}>{label}</button>)}</div><form className="upload-layout" onSubmit={submit}><div className="upload-main"><section className="form-panel"><div className="panel-heading"><span className="panel-step">01</span><div><h2>Project details</h2><p>Give the project a clear identity.</p></div></div>{mode==='github'&&<label className="field-label">PUBLIC REPOSITORY URL<input name="url" type="url" required placeholder="https://github.com/owner/repository" /></label>}<label className="field-label">PROJECT TITLE<input name="name" required={mode!=='github'} disabled={mode==='github'} minLength="2" maxLength="140" placeholder={mode==='github'?'Imported from repository':'e.g. Atlas: neighborhood skill exchange'} /></label><label className="field-label">DESCRIPTION<textarea name="description" maxLength="5000" rows="4" placeholder="What does it do? What was working, and what still needs attention?" /></label><div className="field-pair"><label className="field-label">CATEGORY<select name="category" defaultValue="Web App">{CATEGORIES.map((item)=><option key={item}>{item}</option>)}</select></label><label className="field-label">COMPLETION<input name="completion" type="number" min="0" max="100" defaultValue="35" /><span className="field-suffix">%</span></label></div><label className="field-label">TECHNOLOGIES<input name="technologies" placeholder="React, FastAPI, PostgreSQL" /><small>Separate technologies with commas.</small></label>{mode==='manual'&&<><label className="field-label">COMPLETED<textarea name="completed" rows="2" placeholder="What is already working?" /></label><label className="field-label">PENDING WORK<textarea name="pending" rows="2" placeholder="What should the next developer tackle?" /></label><label className="field-label">WHY DID YOU PAUSE?<textarea name="reason" rows="2" placeholder="Optional project context" /></label><input type="hidden" name="stack" value="" /></>}</section>{mode==='zip'&&<section className="form-panel archive-panel"><div className="panel-heading"><span className="panel-step">02</span><div><h2>Project archive</h2><p>Upload the actual project ZIP. Maximum size: 15 MB.</p></div></div><label className="file-drop"><input name="file" type="file" accept=".zip,application/zip" required={mode==='zip'} /><span className="file-drop-icon"><Upload size={22} /></span><b>Choose a ZIP archive</b><small>or drop your file here</small><span className="file-drop-note">ZIP only · 15 MB maximum</span></label><div className="upload-safety"><ShieldCheck size={16} /><span>Archive paths and file types are checked on the server before saving.</span></div>{progress!==null&&<div className="upload-progress"><div><span>Uploading archive</span><b>{progress}%</b></div><div className="progress-track"><i style={{width:`${progress}%`}} /></div></div>}</section>}</div><aside className="upload-aside"><div className="publish-note"><span className="publish-icon"><Sparkles size={18} /></span><h3>Make room for the next builder.</h3><p>Your project will appear in community discovery and can be downloaded by other signed-in developers.</p><div className="publish-rule" /><div className="publish-check"><Check size={15} /> Saved to your uploads</div><div className="publish-check"><Check size={15} /> Visible in discovery</div><div className="publish-check"><Check size={15} /> Download count tracked</div></div><button className="button-primary publish-button" disabled={busy}>{busy?<LoaderCircle className="spin" size={17} />:<Upload size={17} />}{busy?'Saving project...':mode==='github'?'Import repository':mode==='manual'?'Save project':'Save and publish'}<ArrowRight size={16} /></button></aside></form></>;
}

function ProjectWorkspace({ project, owner, busy, downloadProgress, download, requestRevival, runAnalysis, roadmapChoice, setRoadmapChoice, createRoadmap, back, notes, setNotes, saveNotes, updateTask, inspectFile, revivalRequests, deleteProject }) {
  const isDownloading=downloadProgress?.id===project.id;
  return <><button className="back-link" onClick={back}><ArrowLeft size={16} /> Back to projects</button><div className="detail-heading"><div><span className="eyebrow">{project.category||'COMMUNITY PROJECT'} <span className="eyebrow-divider">/</span> {project.source||'shared'}</span><h1>{project.name}</h1><p>{project.description||'A project waiting for its next chapter.'}</p></div><StatusPill status={project.status} /></div><div className="detail-overview"><div className="detail-primary"><div className="detail-tags"><span className="category-tag">{project.category||'Other'}</span>{(project.technologies||[]).map((tech)=><span key={tech}>{tech}</span>)}</div><div className="detail-progress"><div className="progress-label"><span>Reported completion</span><b>{project.completion??0}%</b></div><div className="progress-track"><i style={{width:`${project.completion??0}%`}} /></div></div><div className="detail-metrics"><div><b>{project.download_count||0}</b><small>DOWNLOADS</small></div><div><b>{project.files?.length??'—'}</b><small>READABLE FILES</small></div><div><b>{project.progress??0}%</b><small>ROADMAP PROGRESS</small></div></div></div><aside className="detail-action-panel"><span className="eyebrow">TAKE IT FURTHER</span><p>{owner?'Your project is available to the community.':'Bring this project into your local workspace and start building.'}</p><button className="button-primary full-button" disabled={isDownloading} onClick={()=>download(project)}>{isDownloading?<LoaderCircle className="spin" size={17} />:<Download size={17} />}{isDownloading?downloadProgress.total?`${Math.round(downloadProgress.loaded/downloadProgress.total*100)}% downloaded`:`${(downloadProgress.loaded/1024/1024).toFixed(1)} MB received`:'Download project ZIP'}{!isDownloading&&<ArrowDownToLine size={17} />}</button>{!owner&&<button className="button-secondary full-button" disabled={busy} onClick={()=>requestRevival(project)}><Zap size={16} /> Request to collaborate</button>}</aside></div>{project.analysis?.generated_at&&<section className="detail-section"><div className="section-head"><div><span className="eyebrow">PROJECT AUTOPSY</span><h2>Readiness estimate <span className="score">{project.analysis.score}<small>/100</small></span></h2></div>{owner&&<button className="button-secondary" disabled={busy} onClick={()=>runAnalysis(project)}><Activity size={16} /> Run analysis again</button>}</div><p className="analysis-note">{project.analysis.method}</p><div className="finding-grid">{(project.analysis.findings||[]).map((finding,index)=><div className={`finding ${finding.kind}`} key={`${finding.title}-${index}`}><span>{finding.kind==='warning'?'!':<Check size={15} />}</span><div><b>{finding.title}</b><p>{finding.detail}</p></div></div>)}</div></section>}{owner&&<><section className="detail-section roadmap-section"><div className="section-head"><div><span className="eyebrow">REVIVAL WORKSPACE</span><h2>Project roadmap</h2></div><div className="roadmap-actions"><select value={roadmapChoice} onChange={(event)=>setRoadmapChoice(event.target.value)}>{['Continue','Restart','Pivot','Repurpose','Archive'].map((choice)=><option key={choice}>{choice}</option>)}</select><button className="button-secondary" disabled={busy||!project.analysis?.generated_at} onClick={()=>createRoadmap(project)}><Sparkles size={16} /> Generate roadmap</button></div></div>{project.tasks?.length?<div className="roadmap-list">{project.tasks.map((task,index)=><label className={`roadmap-item ${task.done?'roadmap-done':''}`} key={task.id}><span className="roadmap-index">{String(index+1).padStart(2,'0')}</span><input className="roadmap-toggle" type="checkbox" checked={Boolean(task.done)} disabled={busy} onChange={(event)=>updateTask(project,task,event.target.checked)} /><div><b>{task.title}</b><p>{task.detail}</p></div><span className="priority-tag">{task.priority}</span></label>)}</div>:<div className="roadmap-empty"><p>Run an autopsy, then generate practical first milestones.</p><button className="button-secondary" disabled={busy} onClick={()=>runAnalysis(project)}><Activity size={16} /> Run project autopsy</button></div>}</section><div className="owner-tools-grid"><section className="detail-section owner-tool"><div className="section-head"><div><span className="eyebrow">PROJECT MEMORY</span><h2>Recovery notes</h2></div></div><textarea className="recovery-notes" value={notes} onChange={(event)=>setNotes(event.target.value)} maxLength="10000" placeholder="Keep useful context about this project..." /><button className="button-secondary" disabled={busy} onClick={()=>saveNotes(project)}>Save notes</button></section><section className="detail-section owner-tool"><div className="section-head"><div><span className="eyebrow">SOURCE INVENTORY</span><h2>Files <small>({project.files?.length||0})</small></h2></div></div><div className="source-file-list">{(project.files||[]).slice(0,30).map((file)=><button key={file.id} onClick={()=>inspectFile(project,file)}><Code2 size={14} /><span>{file.path}</span><small>{Math.ceil(file.size/1024)} KB</small></button>)}{!project.files?.length&&<p>No readable files were indexed.</p>}</div></section></div><section className="detail-section request-section"><div className="section-head"><div><span className="eyebrow">COMMUNITY INTEREST</span><h2>Revival requests <small>({revivalRequests.length})</small></h2></div></div>{revivalRequests.length?revivalRequests.map((request)=><div className="request-row" key={request.id}><span className="user-avatar">{request.user_name.slice(0,1).toUpperCase()}</span><div><b>{request.user_name}</b><small>{request.user_email} · {formatDate(request.created)}</small></div><StatusPill status={request.status} /></div>):<p className="empty-copy">No collaboration requests yet.</p>}<button className="button-secondary danger-action" disabled={busy} onClick={()=>deleteProject(project)}><X size={15} /> Delete project</button></section></>}</>;
}

function ProjectFeatures({ project, owner, busy, aiStatus, runAiDoctor, versions, uploadVersion, downloadVersion, requests, decideRequest, matches, members, assignTask, updateTask, chatMessages, chatText, setChatText, sendAiMessage }) {
  const canChat = owner || project.is_member;
  const review = project.ai_review || {};
  return <div className="project-feature-grid">
    <section className="detail-section ai-doctor-panel">
      <div className="feature-heading"><div><span className="eyebrow">AI PROJECT DOCTOR</span><h2>Evidence-based review</h2></div>{owner && <button className="button-primary" disabled={busy} onClick={() => runAiDoctor(project)}><Sparkles size={16} />{busy ? 'Reviewing...' : review.generated_at ? 'Refresh review' : 'Run AI review'}</button>}</div>
      {review.generated_at ? <><div className="review-summary"><span className="review-score">{review.score}<small>/100</small></span><div><b>{review.health || 'AI health review'}</b><p>{review.summary}</p></div><span className="review-model">{review.model}</span></div><div className="review-columns">{[['Missing files',review.missing_files],['Dependency gaps',review.dependency_gaps],['Incomplete features',review.incomplete_features],['Suggested improvements',review.improvements]].map(([title,items])=><div className="review-list" key={title}><h3>{title}</h3>{items?.length?<ul>{items.map((item,index)=><li key={`${title}-${index}`}>{typeof item==='string'?item:JSON.stringify(item)}</li>)}</ul>:<p>None identified in the supplied source excerpts.</p>}</div>)}</div>{review.potential_errors?.length>0&&<div className="review-list"><h3>Potential errors</h3><ul>{review.potential_errors.map((item,index)=><li key={index}><b>{item.file}</b>: {item.issue} <small>({item.severity})</small></li>)}</ul></div>}<p className="analysis-note">Generated from saved project metadata and indexed source excerpts. The model does not execute the project.</p></>:<div className="feature-empty"><Sparkles size={20}/><p>{owner?'Run the AI doctor to inspect the project files and receive a sourced health report.':'No AI report has been published for this project yet.'}</p></div>}
    </section>
    <section className="detail-section ai-chat-panel">
      <div className="feature-heading"><div><span className="eyebrow">PROJECT ASSISTANT</span><h2>Ask about this project</h2></div><span className={`ai-status ${aiStatus.configured?'ai-ready':'ai-unconfigured'}`}>{aiStatus.configured?`LIVE · ${aiStatus.model}`:'API KEY REQUIRED'}</span></div>
      {canChat ? <><div className="chat-transcript" aria-live="polite">{chatMessages.length?chatMessages.map((message,index)=><article className={`chat-message chat-${message.role}`} key={`${message.created}-${index}`}><b>{message.role==='assistant'?'REVIVE assistant':'You'}</b><p>{message.content}</p></article>):<p className="feature-empty-copy">Ask about code, errors, architecture, or a possible next step.</p>}</div><form className="chat-form" onSubmit={(event)=>sendAiMessage(event,project)}><textarea value={chatText} onChange={(event)=>setChatText(event.target.value)} maxLength="4000" rows="2" placeholder="Ask a project-specific question..."/><button className="button-primary" disabled={busy||!chatText.trim()}>{busy?'Thinking...':'Send'}<ArrowRight size={15}/></button></form></>:<div className="feature-empty"><ShieldCheck size={19}/><p>Request to collaborate and wait for the owner to accept before using the project assistant.</p></div>}
    </section>
    <section className="detail-section version-panel">
      <div className="feature-heading"><div><span className="eyebrow">ARCHIVE HISTORY</span><h2>Project versions</h2></div></div>
      {versions.length?<div className="version-list">{versions.map((version)=><div className="version-row" key={version.version}><span className="version-number">v{version.version}</span><div><b>{version.note||`Version ${version.version}`}</b><small>{formatDate(version.created)}</small></div><button className="button-secondary" onClick={()=>downloadVersion(project,version.version)}><Download size={15}/>Download</button></div>)}</div>:<p className="feature-empty-copy">No ZIP version history is available for this project.</p>}
      {owner&&<form className="version-upload" onSubmit={(event)=>uploadVersion(event,project)}><label className="field-label">PUBLISH A NEW ZIP VERSION<input type="file" name="file" accept=".zip,application/zip" required/></label><input name="note" maxLength="300" placeholder="Version note (optional)"/><button className="button-secondary" disabled={busy}><Upload size={15}/>Publish version</button></form>}
    </section>
    <section className="detail-section collaboration-panel">
      <div className="feature-heading"><div><span className="eyebrow">COLLABORATION</span><h2>{owner?'Developer matches & requests':'Project collaborators'}</h2></div><span className="member-count">{members.length} accepted</span></div>
      {owner&&<><div className="match-list">{matches.length?matches.map((match)=><div className="match-row" key={match.user_id}><span className="user-avatar">{match.name.slice(0,1).toUpperCase()}</span><div><b>{match.name}</b><small>Matches: {match.matching_skills.join(', ')}</small></div><span className="match-score">{match.score}%</span>{match.member&&<span className="member-label">JOINED</span>}</div>):<p className="feature-empty-copy">Add technologies to your project and encourage developers to add skills to their profiles to find matches.</p>}</div><h3 className="subsection-title">Join requests</h3>{requests.length?requests.map((request)=><div className="match-row" key={request.id}><span className="user-avatar">{request.user_name.slice(0,1).toUpperCase()}</span><div><b>{request.user_name}</b><small>{request.user_email} · {formatDate(request.created)}</small></div><span className={`request-status request-${request.status.toLowerCase()}`}>{request.status}</span>{request.status==='Pending'&&<div className="request-actions"><button className="button-secondary" disabled={busy} onClick={()=>decideRequest(project,request.id,'Declined')}>Decline</button><button className="button-primary" disabled={busy} onClick={()=>decideRequest(project,request.id,'Accepted')}>Accept</button></div>}</div>):<p className="feature-empty-copy">No join requests yet.</p>}</>}
      {!owner&&members.map((member)=><div className="match-row" key={member.user_id}><span className="user-avatar">{member.name.slice(0,1).toUpperCase()}</span><div><b>{member.name}</b><small>{member.skills.join(', ')||'Collaborator'}</small></div></div>)}
      {owner&&project.tasks?.length>0&&<><h3 className="subsection-title">Assign roadmap tasks</h3><div className="assignment-list">{project.tasks.map((task)=><label className="assignment-row" key={task.id}><span>{task.title}</span><select value={task.assignee_user_id||''} disabled={busy||members.length===0} onChange={(event)=>assignTask(project,task,event.target.value)}><option value="">Unassigned</option>{members.map((member)=><option key={member.user_id} value={member.user_id}>{member.name}</option>)}</select></label>)}</div></>}
      {!owner&&project.is_member&&project.tasks?.length>0&&<><h3 className="subsection-title">Shared progress</h3><div className="assignment-list">{project.tasks.map((task)=><label className="assignment-row" key={task.id}><span>{task.title}{task.assignee_name&&<small>Assigned to {task.assignee_name}</small>}</span><input type="checkbox" checked={Boolean(task.done)} disabled={busy} onChange={(event)=>updateTask(project,task,event.target.checked)}/></label>)}</div></>}
    </section>
  </div>;
}

function ProfileSkillsEditor({ skills, setSkills, submit, busy }) {
  return <section className="form-panel skills-panel"><div className="panel-heading"><span className="panel-step"><Code2 size={16}/></span><div><h2>Developer matchmaking</h2><p>Add skills used to find relevant revival projects.</p></div></div><form className="skills-form" onSubmit={submit}><label className="field-label">YOUR SKILLS<input value={skills} onChange={(event)=>setSkills(event.target.value)} maxLength="800" placeholder="Python, React, UI design"/><small>Separate skills with commas.</small></label><button className="button-secondary" disabled={busy}>Save skills</button></form></section>;
}

function ProjectCard({ project, open, download, downloading }) {
  return <article className="project-card"><div className="project-card-top"><span className="project-symbol"><Code2 size={20} /></span><StatusPill status={project.status} /></div><button className="project-card-title" onClick={open}>{project.name}</button><p className="project-card-description">{project.description || 'A community project ready for its next chapter.'}</p><div className="project-tags"><span>{project.category || 'Other'}</span>{(project.technologies || []).slice(0, 2).map((tech) => <span key={tech}>{tech}</span>)}</div><div className="card-progress"><div><span>Completion</span><b>{project.completion ?? 0}%</b></div><div className="progress-track"><i style={{ width: `${project.completion ?? 0}%` }} /></div></div><div className="project-card-foot"><span><Download size={14} /> {project.download_count || 0}</span><button className="card-download" aria-label={`Download ${project.name}`} disabled={downloading} onClick={download}>{downloading ? <LoaderCircle className="spin" size={16} /> : <ArrowDownToLine size={17} />}</button><button className="card-open" onClick={open}>Details <ArrowRight size={14} /></button></div></article>;
}

function ProjectRow({ project, open }) {
  return <button className="project-row" onClick={open}><span className="row-project-icon"><Code2 size={18} /></span><span className="row-project-copy"><b>{project.name}</b><small>{project.category} · Updated {timeAgo(project.updated)}</small></span><span className="row-completion"><span>{project.completion ?? 0}% complete</span><i><b style={{ width: `${project.completion ?? 0}%` }} /></i></span><StatusPill status={project.status} /><ArrowRight size={15} className="row-arrow" /></button>;
}

function StatCard({ label, value, note, icon: Icon, color }) {
  return <div className={`stat-card stat-${color}`}><div className="stat-card-top"><span>{label}</span><span className="stat-icon"><Icon size={18} /></span></div><b className="stat-value">{value}</b><small>{note}</small><span className="stat-accent" /></div>;
}

function StatusPill({ status = 'Imported' }) {
  return <span className={`status-pill status-${status.toLowerCase()}`}>{status}</span>;
}

function PageHeading({ eyebrow, title, copy, action }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{copy}</p></div>{action}</div>;
}

function EmptyState({ icon: Icon, title, copy, action, onClick }) {
  return <div className="empty-state"><span className="empty-icon"><Icon size={22} /></span><h3>{title}</h3><p>{copy}</p>{action && <button className="button-secondary" onClick={onClick}>{action}<ArrowRight size={15} /></button>}</div>;
}

function pageLabel(page) {
  return ({ overview: 'Overview', discover: 'Discover', uploads: 'My uploads', downloads: 'My downloads', upload: 'Share a project', project: 'Project details', profile: 'Profile' })[page] || 'Overview';
}
function formatDate(value) { return value ? new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recently'; }
function formatBytes(value) {
  if (!value) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const unit = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / (1024 ** unit)).toFixed(unit ? 1 : 0)} ${units[unit]}`;
}

function timeAgo(value) {
  if (!value) return 'Recently';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return formatDate(value);
}

export default App;
