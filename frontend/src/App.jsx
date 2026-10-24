import { useEffect, useState } from 'react';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Bell, Check, CheckCircle2,
  ChevronDown, Clock3, Code2, Compass, Download, FileArchive, FolderKanban,
  Gauge, LoaderCircle, LogOut, Menu, Plus, Search, Settings2,
  ShieldCheck, Sparkles, Upload, X, Zap,
} from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '/api';
const CATEGORIES = ['Web App', 'Mobile App', 'AI & Data', 'Developer Tools', 'Games', 'Other'];
const tokenStore = 'revive-os-token';

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

  const notify = (message, kind = 'success') => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 3600);
  };

  const refreshWorkspace = async (activeToken = token) => {
    const [me, dashboard, mine, publicProjects, history] = await Promise.all([
      api('/auth/me', {}, activeToken), api('/dashboard', {}, activeToken),
      api('/projects', {}, activeToken), api('/discover?limit=100', {}, activeToken),
      api('/downloads', {}, activeToken),
    ]);
    setUser(me);
    setProfileName(me.name);
    setStats(dashboard.stats);
    setProjects(mine);
    setDiscovered(publicProjects);
    setDownloads(history);
    setActivity(dashboard.activity);
  };

  useEffect(() => {
    if (!token) {
      setSessionLoading(false);
      return;
    }
    refreshWorkspace(token)
      .catch((cause) => {
        localStorage.removeItem(tokenStore);
        setToken(null);
        setError(cause.message);
      })
      .finally(() => setSessionLoading(false));
  }, [token]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const run = async (operation) => {
    setBusy(true);
    setError('');
    try {
      await operation();
    } catch (cause) {
      setError(cause.message || 'Something went wrong. Please try again.');
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
      setVersions(await api(`/projects/${project.id}/versions`, {}, token));
      if (projects.some((item) => item.id === project.id)) {
        const [requests, projectMatches, projectMembers, messages] = await Promise.all([
          api(`/projects/${project.id}/revival-requests`, {}, token),
          api(`/projects/${project.id}/matches`, {}, token),
          api(`/projects/${project.id}/members`, {}, token),
          api(`/projects/${project.id}/ai/messages`, {}, token),
        ]);
        setRevivalRequests(requests);
        setMatches(projectMatches);
        setMembers(projectMembers.map((member) => ({ ...member, skills: JSON.parse(member.skills) })));
        setChatMessages(messages);
      } else {
        setRevivalRequests([]);
        setMatches([]);
        setMembers([]);
        setChatMessages([]);
      }
    } catch (cause) {
      setError(cause.message);
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
    } catch (cause) {
      setError(cause.message || 'Download failed.');
    } finally {
      setDownloadProgress(null);
    }
  };

  const updateProfile = (event) => {
    event.preventDefault();
    run(async () => {
      const updated = await api('/auth/profile', { method: 'PATCH', body: JSON.stringify({ name: profileName }) }, token);
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
    const updated = await api(`/projects/${project.id}/roadmap`, { method: 'POST', body: JSON.stringify({ direction: roadmapChoice }) }, token);
    setSelected(updated);
    await refreshWorkspace(token);
    notify('Revival roadmap created.');
  });

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

  const deleteProject = (project) => {
    if (!window.confirm(`Delete "${project.name}" and its saved project data? This cannot be undone.`)) return;
    run(async () => {
      await api(`/projects/${project.id}`, { method: 'DELETE' }, token);
      await refreshWorkspace(token);
      setSelected(null);
      setPage('uploads');
      notify('Project deleted.');
    });
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
          {page === 'overview' && <Overview user={user} stats={stats} projects={projects} activity={activity} openProject={openProject} setPage={setPage} />}
          {page === 'discover' && <Discover projects={discovered} query={query} setQuery={setQuery} category={category} setCategory={setCategory} technology={technology} setTechnology={setTechnology} technologies={technologies} search={searchProjects} openProject={openProject} download={downloadProject} progress={downloadProgress} setPage={setPage} />}
          {page === 'uploads' && <ProjectCollection title="My uploads" eyebrow="YOUR CONTRIBUTIONS" description="Projects you have shared with the community." projects={projects} openProject={openProject} download={downloadProject} progress={downloadProgress} emptyAction={() => setPage('upload')} emptyLabel="Share your first project" />}
          {page === 'downloads' && <Downloads items={downloads} openProject={openProject} download={downloadProject} progress={downloadProgress} setPage={setPage} />}
          {page === 'upload' && <UploadWorkspace busy={busy} progress={uploadProgress} submit={uploadProject} mode={uploadMode} setMode={setUploadMode} goBack={() => setPage('overview')} />}
          {page === 'project' && selected && <ProjectWorkspace project={selected} owner={isOwner} busy={busy} downloadProgress={downloadProgress} download={downloadProject} requestRevival={requestRevival} runAnalysis={runAnalysis} roadmapChoice={roadmapChoice} setRoadmapChoice={setRoadmapChoice} createRoadmap={createRoadmap} back={() => setPage(previousPage)} notes={notes} setNotes={setNotes} saveNotes={saveNotes} updateTask={updateTask} inspectFile={inspectFile} revivalRequests={revivalRequests} deleteProject={deleteProject} />}
          {page === 'profile' && <Profile user={user} name={profileName} setName={setProfileName} submit={updateProfile} busy={busy} saved={profileSaved} logout={logout} />}
        </div>
      </main>
      {mobileNav && <button className="mobile-scrim" aria-label="Close navigation" onClick={() => setMobileNav(false)} />}
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

function Overview({ user, stats, projects, activity, openProject, setPage }) {
  return (
    <>
      <section className="welcome-band">
        <div className="welcome-copy"><span className="eyebrow"><span className="eyebrow-mark" /> YOUR PROJECT EXCHANGE</span><h1>Make something<br /><em>move forward.</em></h1><p>Discover unfinished work with potential, or give your own project another path.</p><div className="welcome-actions"><button className="button-primary" onClick={() => setPage('discover')}><Compass size={17} /> Explore projects <ArrowRight size={16} /></button><button className="button-secondary" onClick={() => setPage('upload')}><Plus size={17} /> Share a project</button></div></div>
        <div className="welcome-art" aria-hidden="true"><div className="art-ring ring-one" /><div className="art-ring ring-two" /><div className="art-cross cross-one" /><div className="art-cross cross-two" /><div className="art-core"><Activity size={48} strokeWidth={1.4} /></div><span className="art-label">IDEA IN MOTION</span></div>
      </section>
      <div className="section-head"><div><span className="eyebrow">YOUR MOMENTUM</span><h2>Workspace overview</h2></div><span className="quiet-label">Good to see you, {user.name.split(' ')[0]}</span></div>
      <div className="stats-grid"><StatCard label="Projects shared" value={stats.uploads} note="Published by you" icon={FolderKanban} color="cyan" /><StatCard label="In revival" value={stats.active} note="Active milestones" icon={Activity} color="lime" /><StatCard label="Completed" value={stats.completed} note="Revival journeys" icon={CheckCircle2} color="blue" /><StatCard label="Downloaded" value={stats.downloads} note="Projects in your library" icon={Download} color="orange" /></div>
      <div className="dashboard-columns"><section className="content-section"><div className="section-head section-head-tight"><div><span className="eyebrow">PICK UP THE THREAD</span><h2>Recently shared</h2></div><button className="text-link" onClick={() => setPage('uploads')}>All uploads <ArrowRight size={15} /></button></div>{projects.length ? <div className="compact-list">{projects.slice(0, 4).map((project) => <ProjectRow key={project.id} project={project} open={() => openProject(project)} />)}</div> : <EmptyState icon={FolderKanban} title="Nothing shared yet" copy="Put an unfinished project in motion." action="Share a project" onClick={() => setPage('upload')} />}</section><section className="content-section activity-section"><div className="section-head section-head-tight"><div><span className="eyebrow">LATEST</span><h2>Recent activity</h2></div><Clock3 size={17} className="quiet-icon" /></div>{activity.length ? <div className="activity-list">{activity.map((item, index) => <div className="activity-item" key={`${item.kind}-${item.project_id}-${item.created}`}><span className={`activity-icon activity-${item.kind}`}>{item.kind === 'download' ? <Download size={15} /> : <Upload size={15} />}</span><div><b>{item.kind === 'download' ? 'Downloaded' : 'Updated'} {item.project_name}</b><small>{timeAgo(item.created)}</small></div><span className="activity-index">{String(index + 1).padStart(2, '0')}</span></div>)}</div> : <p className="empty-copy">Your project activity will appear here.</p>}</section></div>
    </>
  );
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
function timeAgo(value) {
  if (!value) return 'Recently';
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return formatDate(value);
}

export default App;
