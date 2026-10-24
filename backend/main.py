import os,re,json,sqlite3,zipfile,io,uuid,datetime,collections,hashlib,hmac,secrets,base64,asyncio
from pathlib import Path
from urllib.parse import urlparse
import httpx
from fastapi import FastAPI,UploadFile,File,Form,HTTPException,Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse,JSONResponse,FileResponse
from pydantic import BaseModel,Field
from reportlab.pdfgen import canvas
ROOT=Path(__file__).resolve().parent.parent; STORE=ROOT/'storage'; STORE.mkdir(exist_ok=True); DB=STORE/'revive.db'; UPLOADS=STORE/'uploads'; UPLOADS.mkdir(exist_ok=True)
MAX_BYTES=15*1024*1024; MAX_FILES=600; MAX_EXTRACT=35*1024*1024
app=FastAPI(title='REVIVE OS API',version='1.0')
app.add_middleware(CORSMiddleware,allow_origins=[x.strip() for x in os.getenv('FRONTEND_ORIGIN','http://localhost:5173').split(',')],allow_credentials=False,allow_methods=['*'],allow_headers=['*'])
SECRET_FILE=STORE/'.auth-secret'
if not SECRET_FILE.exists(): SECRET_FILE.write_text(secrets.token_hex(32),encoding='ascii')
AUTH_SECRET=os.getenv('AUTH_SECRET',SECRET_FILE.read_text(encoding='ascii').strip()).encode()
def conn():
 c=sqlite3.connect(DB);c.row_factory=sqlite3.Row;c.execute('PRAGMA foreign_keys=ON');return c
def init():
 with conn() as c:
  c.executescript('''CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,password_hash TEXT NOT NULL,name TEXT NOT NULL,created TEXT NOT NULL);CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,name TEXT NOT NULL,description TEXT DEFAULT '',source TEXT,repo TEXT DEFAULT '',created TEXT,updated TEXT,status TEXT DEFAULT 'Imported',direction TEXT DEFAULT '',notes TEXT DEFAULT '',analysis TEXT DEFAULT '{}');CREATE TABLE IF NOT EXISTS files(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,path TEXT NOT NULL,content TEXT DEFAULT '',size INTEGER DEFAULT 0);CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,title TEXT NOT NULL,detail TEXT DEFAULT '',priority TEXT DEFAULT 'Medium',done INTEGER DEFAULT 0,position INTEGER DEFAULT 0);''')
  user_columns={r['name'] for r in c.execute('PRAGMA table_info(users)')}
  if 'skills' not in user_columns:c.execute("ALTER TABLE users ADD COLUMN skills TEXT NOT NULL DEFAULT '[]'")
  columns={r['name'] for r in c.execute('PRAGMA table_info(projects)')}
  for name,definition in [('owner_id','TEXT REFERENCES users(id) ON DELETE CASCADE'),('category',"TEXT NOT NULL DEFAULT 'Other'"),('technologies',"TEXT NOT NULL DEFAULT '[]'"),('completion','INTEGER NOT NULL DEFAULT 0'),('download_count','INTEGER NOT NULL DEFAULT 0'),('archive_path','TEXT'),('is_public','INTEGER NOT NULL DEFAULT 1'),('ai_review',"TEXT NOT NULL DEFAULT '{}'")]:
   if name not in columns:c.execute(f'ALTER TABLE projects ADD COLUMN {name} {definition}')
  task_columns={r['name'] for r in c.execute('PRAGMA table_info(tasks)')}
  if 'assignee_user_id' not in task_columns:c.execute('ALTER TABLE tasks ADD COLUMN assignee_user_id TEXT REFERENCES users(id) ON DELETE SET NULL')
  c.executescript('''CREATE TABLE IF NOT EXISTS download_history(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,downloaded TEXT NOT NULL,UNIQUE(user_id,project_id));CREATE TABLE IF NOT EXISTS revival_requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,message TEXT DEFAULT '',status TEXT NOT NULL DEFAULT 'Pending',created TEXT NOT NULL,UNIQUE(user_id,project_id));''')
  c.executescript('''CREATE TABLE IF NOT EXISTS project_versions(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,version INTEGER NOT NULL,archive_path TEXT NOT NULL,note TEXT DEFAULT '',created TEXT NOT NULL,UNIQUE(project_id,version));CREATE TABLE IF NOT EXISTS project_members(project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,joined TEXT NOT NULL,PRIMARY KEY(project_id,user_id));CREATE TABLE IF NOT EXISTS project_chat(id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,role TEXT NOT NULL,content TEXT NOT NULL,created TEXT NOT NULL);''')
init()
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def hash_password(password,salt=None):
 salt=salt or secrets.token_bytes(16);digest=hashlib.pbkdf2_hmac('sha256',password.encode(),salt,310000)
 return base64.urlsafe_b64encode(salt).decode()+'.'+base64.urlsafe_b64encode(digest).decode()
def verify_password(password,stored):
 try:
  salt,digest=(base64.urlsafe_b64decode(x) for x in stored.split('.',1))
  return hmac.compare_digest(hashlib.pbkdf2_hmac('sha256',password.encode(),salt,310000),digest)
 except (ValueError,TypeError):return False
def token_for(user):
 expires=int(datetime.datetime.now(datetime.timezone.utc).timestamp())+604800;session_id=uuid.uuid4().hex
 with conn() as c:c.execute('INSERT INTO sessions(id,user_id,expires) VALUES(?,?,?)',(session_id,user['id'],expires))
 payload=base64.urlsafe_b64encode(json.dumps({'sub':user['id'],'exp':expires,'sid':session_id}).encode()).rstrip(b'=')
 signature=hmac.new(AUTH_SECRET,payload,hashlib.sha256).digest();return payload.decode()+'.'+base64.urlsafe_b64encode(signature).rstrip(b'=').decode()
def token_user(token):
 try:
  payload,signature=token.split('.',1);raw=payload.encode();expected=base64.urlsafe_b64encode(hmac.new(AUTH_SECRET,raw,hashlib.sha256).digest()).rstrip(b'=').decode()
  if not hmac.compare_digest(signature,expected):return None
  data=json.loads(base64.urlsafe_b64decode(raw+b'='*((4-len(raw)%4)%4)))
  if data['exp']<int(datetime.datetime.now(datetime.timezone.utc).timestamp()):return None
  with conn() as c:return c.execute('SELECT u.id,u.email,u.name,u.created,s.id AS session_id FROM users u JOIN sessions s ON s.user_id=u.id WHERE u.id=? AND s.id=? AND s.expires>=?',(data['sub'],data['sid'],int(datetime.datetime.now(datetime.timezone.utc).timestamp()))).fetchone()
 except (ValueError,KeyError,TypeError,json.JSONDecodeError):return None
@app.middleware('http')
async def require_auth_and_ownership(request:Request,call_next):
 path=request.url.path
 if request.method=='OPTIONS' or path in ('/api/health','/api/auth/signup','/api/auth/login','/api/discover'):
  return await call_next(request)
 if not path.startswith('/api/'):return await call_next(request)
 header=request.headers.get('authorization','');user=token_user(header[7:]) if header.lower().startswith('bearer ') else None
 if not user:return JSONResponse({'detail':'Sign in to continue.'},status_code=401)
 request.state.user=dict(user)
 parts=path.split('/')
 if len(parts)>=4 and parts[2]=='projects' and parts[3] not in ('zip','manual','github'):
  project_id=parts[3]
  with conn() as c:project=c.execute('SELECT owner_id,is_public FROM projects WHERE id=?',(project_id,)).fetchone()
  if not project:return JSONResponse({'detail':'Project not found.'},status_code=404)
  endpoint=parts[4] if len(parts)>4 else ''
  public_read=request.method=='GET' and endpoint==''
  public_versions=request.method=='GET' and endpoint=='versions' and bool(project['is_public'])
  public_download=endpoint=='download' and bool(project['is_public'])
  public_request=endpoint=='revival-requests' and request.method=='POST' and bool(project['is_public'])
  with conn() as c:member=c.execute('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?',(project_id,user['id'])).fetchone()
  ai_action=parts[5] if endpoint=='ai' and len(parts)>5 else ''
  collaborative_route=endpoint=='tasks' or (endpoint=='ai' and ai_action in ('chat','messages')) or (endpoint=='versions' and request.method=='GET')
  if not public_read and not public_versions and not public_download and not public_request and project['owner_id']!=user['id'] and not (member and collaborative_route):
   return JSONResponse({'detail':'You do not have access to this project.'},status_code=403)
 return await call_next(request)
def rowproject(c,id):
 r=c.execute('SELECT * FROM projects WHERE id=?',(id,)).fetchone()
 if not r:raise HTTPException(404,'Project not found')
 d=dict(r);d.pop('owner_id',None);d['technologies']=json.loads(d['technologies']);d['analysis']=json.loads(d['analysis']);d['ai_review']=json.loads(d['ai_review']);d['tasks']=[dict(t) for t in c.execute('SELECT t.*,u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id=t.assignee_user_id WHERE t.project_id=? ORDER BY t.position',(id,))];d['files']=[{'id':f['id'],'path':f['path'],'size':f['size']} for f in c.execute('SELECT id,path,size FROM files WHERE project_id=? ORDER BY path',(id,))];d['progress']=round(100*sum(t['done'] for t in d['tasks'])/len(d['tasks'])) if d['tasks'] else 0;return d
def save(name,description,source,repo='',files=None,owner_id=None,category='Other',technologies=None,completion=0,archive=None):
 id=uuid.uuid4().hex;ts=now();files=files or [];archive_path=None
 if archive:
  archive_path=UPLOADS/f'{id}.zip';archive_path.write_bytes(archive)
 with conn() as c:
  c.execute('INSERT INTO projects(id,name,description,source,repo,created,updated,owner_id,category,technologies,completion,archive_path) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',(id,name.strip()[:140],description[:5000],source,repo,ts,ts,owner_id,category,json.dumps(technologies or []),max(0,min(100,int(completion))),str(archive_path) if archive_path else None))
  c.executemany('INSERT INTO files(id,project_id,path,content,size) VALUES(?,?,?,?,?)',[(uuid.uuid4().hex,id,p,content[:18000],size) for p,content,size in files])
  if archive_path:
   c.execute('INSERT INTO project_versions(id,project_id,version,archive_path,note,created) VALUES(?,?,?,?,?,?)',(uuid.uuid4().hex,id,1,str(archive_path),'Initial upload',ts))
 return id
IGNORED={'.git','node_modules','dist','build','venv','.venv','__pycache__','.next','coverage'}
EXTS={'.py','.js','.jsx','.ts','.tsx','.java','.cpp','.c','.h','.html','.css','.json','.md','.txt','.sql','.yml','.yaml','.toml','.env.example','.vue','.go','.rs'}
def safe_path(name):
 p=Path(name.replace('\\','/'));return not (p.is_absolute() or '..' in p.parts or any(x in IGNORED for x in p.parts) or name.startswith('/'))
def decode(b):
 try:return b.decode('utf-8')
 except UnicodeDecodeError:return ''
def parse_zip(b):
 out=[];total=0
 try:
  with zipfile.ZipFile(io.BytesIO(b)) as z:
   for info in z.infolist():
    if info.is_dir() or (info.external_attr >> 16) & 0o170000 == 0o120000 or not safe_path(info.filename) or info.file_size>400000 or Path(info.filename).suffix.lower() not in EXTS:continue
    total+=info.file_size
    if total>MAX_EXTRACT or len(out)>=MAX_FILES:raise HTTPException(413,'Archive exceeds safe limits')
    if info.compress_size and info.file_size/max(info.compress_size,1)>200:raise HTTPException(400,'Suspicious compression ratio')
    out.append((info.filename,decode(z.read(info)),info.file_size))
 except (zipfile.BadZipFile,RuntimeError):raise HTTPException(400,'Invalid ZIP archive')
 return out
class Manual(BaseModel):
 name:str=Field(min_length=2,max_length=140);description:str=Field(default='',max_length=5000);completed:str='';pending:str='';reason:str='';stack:str='';category:str='Other';technologies:list[str]=[];completion:int=Field(default=0,ge=0,le=100)
class Credentials(BaseModel):email:str=Field(min_length=5,max_length=254);password:str=Field(min_length=8,max_length=128);name:str=Field(default='',min_length=1,max_length=100);skills:list[str]=Field(default_factory=list)
class LoginInput(BaseModel):email:str=Field(min_length=5,max_length=254);password:str=Field(min_length=8,max_length=128)
class ProfileInput(BaseModel):name:str=Field(min_length=1,max_length=100);skills:list[str]=Field(default_factory=list)
class RevivalRequest(BaseModel):message:str=Field(default='',max_length=2000)
def user_payload(user):return {'user':{'id':user['id'],'email':user['email'],'name':user['name'],'created':user['created'],'skills':json.loads(user['skills']) if 'skills' in user.keys() else []},'token':token_for(user)}
def parse_technologies(value):
 try:items=json.loads(value) if isinstance(value,str) else value
 except json.JSONDecodeError:items=[]
 if not isinstance(items,list):items=[]
 return list(dict.fromkeys(str(x).strip()[:40] for x in items if str(x).strip()))[:20]
@app.post('/api/auth/signup')
def signup(p:Credentials):
 email=p.email.strip().lower()
 if not re.fullmatch(r'[^\s@]+@[^\s@]+\.[^\s@]+',email):raise HTTPException(422,'Enter a valid email address.')
 user={'id':uuid.uuid4().hex,'email':email,'name':p.name.strip(),'created':now(),'skills':parse_technologies(p.skills)}
 try:
  with conn() as c:c.execute('INSERT INTO users(id,email,password_hash,name,created,skills) VALUES(?,?,?,?,?,?)',(user['id'],email,hash_password(p.password),user['name'],user['created'],json.dumps(user['skills'])))
 except sqlite3.IntegrityError:raise HTTPException(409,'An account with this email already exists.')
 return user_payload(user)
@app.post('/api/auth/login')
def login(p:LoginInput):
 with conn() as c:user=c.execute('SELECT id,email,password_hash,name,created FROM users WHERE email=?',(p.email.strip().lower(),)).fetchone()
 if not user or not verify_password(p.password,user['password_hash']):raise HTTPException(401,'Email or password is incorrect.')
 return user_payload(user)
@app.get('/api/auth/me')
def me(request:Request):
 with conn() as c:user=c.execute('SELECT id,email,name,created,skills FROM users WHERE id=?',(request.state.user['id'],)).fetchone()
 result=dict(user);result['skills']=json.loads(result['skills']);return result
@app.post('/api/auth/logout')
def logout(request:Request):
 with conn() as c:c.execute('DELETE FROM sessions WHERE id=?',(request.state.user['session_id'],))
 return {'logged_out':True}
@app.patch('/api/auth/profile')
def update_profile(p:ProfileInput,request:Request):
 with conn() as c:
  c.execute('UPDATE users SET name=?,skills=? WHERE id=?',(p.name.strip(),json.dumps(parse_technologies(p.skills)),request.state.user['id']))
  user=dict(c.execute('SELECT id,email,name,created,skills FROM users WHERE id=?',(request.state.user['id'],)).fetchone());user['skills']=json.loads(user['skills']);return user
@app.get('/api/health')
def health():return {'ok':True,'database':'sqlite'}
@app.get('/api/projects')
def projects(request:Request):
 with conn() as c:return [rowproject(c,r['id']) for r in c.execute('SELECT id FROM projects WHERE owner_id=? ORDER BY updated DESC',(request.state.user['id'],))]
@app.post('/api/projects/manual')
def manual(p:Manual,request:Request):
 technologies=parse_technologies(p.technologies or [x.strip() for x in p.stack.split(',')])
 id=save(p.name,p.description,'manual',files=[('PROJECT_CONTEXT.md',f'# {p.name}\nDescription: {p.description}\nStack: {", ".join(technologies)}\nCompleted: {p.completed}\nPending: {p.pending}\nReason: {p.reason}',0)],owner_id=request.state.user['id'],category=p.category,technologies=technologies,completion=p.completion)
 with conn() as c:return rowproject(c,id)
@app.post('/api/projects/zip')
async def zip_upload(request:Request,file:UploadFile=File(...),name:str=Form(''),description:str=Form(''),category:str=Form('Other'),technologies:str=Form('[]'),completion:int=Form(0)):
 if not file.filename or not file.filename.lower().endswith('.zip'):raise HTTPException(400,'Upload a .zip file')
 b=await file.read(MAX_BYTES+1)
 if len(b)>MAX_BYTES:raise HTTPException(413,'ZIP must be 15MB or smaller')
 files=parse_zip(b)
 if not files:raise HTTPException(400,'No supported text/code files found')
 id=save(name.strip() or Path(file.filename).stem,description,'zip',files=files,owner_id=request.state.user['id'],category=category,technologies=parse_technologies(technologies),completion=completion,archive=b)
 with conn() as c:return rowproject(c,id)
class Repo(BaseModel):
 url:str;description:str='';category:str='Other';technologies:list[str]=[];completion:int=Field(default=0,ge=0,le=100)
@app.post('/api/projects/github')
async def github(p:Repo,request:Request):
 u=urlparse(p.url)
 if u.scheme!='https' or u.hostname not in ('github.com','www.github.com'):raise HTTPException(400,'Use a public https://github.com/owner/repo URL')
 parts=[x for x in u.path.split('/') if x]
 if len(parts)!=2 or not all(re.fullmatch(r'[\w.-]+',x) for x in parts):raise HTTPException(400,'Expected github.com/owner/repo')
 owner,repo=parts;repo=repo.removesuffix('.git')
 async with httpx.AsyncClient(timeout=25,follow_redirects=False,headers={'User-Agent':'ReviveOS/1.0','Accept':'application/vnd.github+json'}) as client:
  r=await client.get(f'https://api.github.com/repos/{owner}/{repo}')
  if r.status_code!=200:raise HTTPException(400,'Repository unavailable or GitHub API rate limited')
  meta=r.json();branch=meta['default_branch'];r=await client.get(f'https://api.github.com/repos/{owner}/{repo}/zipball/{branch}',follow_redirects=True)
  if r.status_code!=200 or len(r.content)>MAX_BYTES:raise HTTPException(400,'Could not download repo or repository is too large (15MB limit)')
 files=parse_zip(r.content)
 if not files:raise HTTPException(400,'No supported files in repository')
 id=save(meta['name'],p.description or meta.get('description') or '','github',f'https://github.com/{owner}/{repo}',files,request.state.user['id'],p.category,p.technologies,p.completion,r.content)
 with conn() as c:return rowproject(c,id)
@app.get('/api/projects/{id}')
def get_project(id:str,request:Request):
 with conn() as c:
  result=rowproject(c,id)
  if c.execute('SELECT owner_id FROM projects WHERE id=?',(id,)).fetchone()['owner_id']!=request.state.user['id']:
   return {k:result[k] for k in ('id','name','description','source','repo','created','updated','status','category','technologies','completion','download_count','analysis','progress')}
  return result
@app.get('/api/discover')
def discover(q:str='',category:str='',technology:str='',limit:int=60):
 query=f'%{q.strip()}%';limit=max(1,min(limit,100))
 with conn() as c:
  rows=c.execute("SELECT id FROM projects WHERE is_public=1 AND (?='' OR name LIKE ? OR description LIKE ? OR technologies LIKE ?) AND (?='' OR category=?) AND (?='' OR technologies LIKE ?) ORDER BY updated DESC LIMIT ?",(q.strip(),query,query,query,category,category,technology,f'%{technology}%',limit)).fetchall()
  result=[]
  for row in rows:
   p=rowproject(c,row['id']);result.append({k:p[k] for k in ('id','name','description','source','repo','created','updated','status','category','technologies','completion','download_count','analysis','progress')})
  return result
@app.get('/api/dashboard')
def dashboard(request:Request):
 user_id=request.state.user['id']
 with conn() as c:
  projects=[rowproject(c,r['id']) for r in c.execute('SELECT id FROM projects WHERE owner_id=? ORDER BY updated DESC',(user_id,))]
  downloads=c.execute('SELECT COUNT(*) FROM download_history WHERE user_id=?',(user_id,)).fetchone()[0]
  activity=[{'kind':'upload','project_id':p['id'],'project_name':p['name'],'created':p['updated']} for p in projects[:5]]
  activity.extend({'kind':'download','project_id':r['id'],'project_name':r['name'],'created':r['downloaded']} for r in c.execute('SELECT p.id,p.name,d.downloaded FROM download_history d JOIN projects p ON p.id=d.project_id WHERE d.user_id=? ORDER BY d.downloaded DESC LIMIT 5',(user_id,)))
  activity.sort(key=lambda x:x['created'],reverse=True)
  return {'stats':{'uploads':len(projects),'active':sum(p['status']=='Reviving' for p in projects),'completed':sum(p['status']=='Completed' for p in projects),'downloads':downloads},'projects':projects[:5],'activity':activity[:8]}
@app.get('/api/downloads')
def downloads(request:Request):
 with conn() as c:
  rows=c.execute('SELECT p.id,p.name,p.description,p.category,p.technologies,p.status,p.completion,p.download_count,d.downloaded FROM download_history d JOIN projects p ON p.id=d.project_id WHERE d.user_id=? ORDER BY d.downloaded DESC',(request.state.user['id'],)).fetchall()
  return [{**dict(r),'technologies':json.loads(r['technologies'])} for r in rows]
@app.post('/api/projects/{id}/revival-requests')
def create_revival_request(id:str,p:RevivalRequest,request:Request):
 try:
  with conn() as c:c.execute('INSERT INTO revival_requests(id,user_id,project_id,message,created) VALUES(?,?,?,?,?)',(uuid.uuid4().hex,request.state.user['id'],id,p.message,now()))
 except sqlite3.IntegrityError:raise HTTPException(409,'You already requested to revive this project.')
 return {'created':True}
@app.get('/api/projects/{id}/revival-requests')
def project_revival_requests(id:str):
 with conn() as c:return [dict(r) for r in c.execute('SELECT r.id,r.message,r.status,r.created,u.id AS user_id,u.name AS user_name,u.email AS user_email FROM revival_requests r JOIN users u ON u.id=r.user_id WHERE r.project_id=? ORDER BY r.created DESC',(id,))]
class RequestDecision(BaseModel):status:str
@app.patch('/api/projects/{id}/revival-requests/{request_id}')
def decide_revival_request(id:str,request_id:str,p:RequestDecision):
 if p.status not in ('Accepted','Declined'):raise HTTPException(400,'Status must be Accepted or Declined.')
 with conn() as c:
  r=c.execute('SELECT user_id FROM revival_requests WHERE id=? AND project_id=?',(request_id,id)).fetchone()
  if not r:raise HTTPException(404,'Revival request not found.')
  c.execute('UPDATE revival_requests SET status=? WHERE id=?',(p.status,request_id))
  if p.status=='Accepted':c.execute('INSERT OR IGNORE INTO project_members(project_id,user_id,joined) VALUES(?,?,?)',(id,r['user_id'],now()))
  else:c.execute('DELETE FROM project_members WHERE project_id=? AND user_id=?',(id,r['user_id']))
  return {'status':p.status}
@app.get('/api/revival-requests')
def my_revival_requests(request:Request):
 with conn() as c:return [dict(r) for r in c.execute('SELECT r.id,r.message,r.status,r.created,p.id AS project_id,p.name AS project_name FROM revival_requests r JOIN projects p ON p.id=r.project_id WHERE r.user_id=? ORDER BY r.created DESC',(request.state.user['id'],))]
@app.get('/api/projects/{id}/versions')
def project_versions(id:str):
 with conn() as c:return [dict(r) for r in c.execute('SELECT version,note,created FROM project_versions WHERE project_id=? ORDER BY version DESC',(id,))]
@app.post('/api/projects/{id}/versions')
async def upload_project_version(id:str,request:Request,file:UploadFile=File(...),note:str=Form('')):
 if not file.filename or not file.filename.lower().endswith('.zip'):raise HTTPException(400,'Upload a .zip file.')
 archive=await file.read(MAX_BYTES+1)
 if len(archive)>MAX_BYTES:raise HTTPException(413,'ZIP must be 15MB or smaller.')
 extracted=parse_zip(archive)
 if not extracted:raise HTTPException(400,'No supported files were found in the ZIP.')
 with conn() as c:
  require_project_owner(c,id,request.state.user['id'])
  version=c.execute('SELECT COALESCE(MAX(version),0)+1 FROM project_versions WHERE project_id=?',(id,)).fetchone()[0]
  path=UPLOADS/f'{id}-v{version}.zip';path.write_bytes(archive);created=now()
  c.execute('INSERT INTO project_versions(id,project_id,version,archive_path,note,created) VALUES(?,?,?,?,?,?)',(uuid.uuid4().hex,id,version,str(path),note[:300],created))
  c.execute('UPDATE projects SET archive_path=?,updated=? WHERE id=?',(str(path),created,id));c.execute('DELETE FROM files WHERE project_id=?',(id,))
  c.executemany('INSERT INTO files(id,project_id,path,content,size) VALUES(?,?,?,?,?)',[(uuid.uuid4().hex,id,p,content[:18000],size) for p,content,size in extracted])
  return rowproject(c,id)
@app.get('/api/projects/{id}/versions/{version}/download')
def download_version(id:str,version:int):
 with conn() as c:r=c.execute('SELECT archive_path,project_id FROM project_versions WHERE project_id=? AND version=?',(id,version)).fetchone()
 if not r or not Path(r['archive_path']).is_file():raise HTTPException(404,'Project version not found.')
 return FileResponse(r['archive_path'],media_type='application/zip',filename=f'revive-{id[:8]}-v{version}.zip')
@app.get('/api/projects/{id}/matches')
def project_matches(id:str,request:Request):
 with conn() as c:
  require_project_owner(c,id,request.state.user['id']);technologies=json.loads(c.execute('SELECT technologies FROM projects WHERE id=?',(id,)).fetchone()['technologies']);stack={x.casefold() for x in technologies}
  members={r['user_id'] for r in c.execute('SELECT user_id FROM project_members WHERE project_id=?',(id,))};users=c.execute('SELECT id,name,skills FROM users WHERE id!=?',(request.state.user['id'],)).fetchall();matches=[]
  for user in users:
   skills=json.loads(user['skills']);overlap=[x for x in skills if x.casefold() in stack]
   if overlap:matches.append({'user_id':user['id'],'name':user['name'],'skills':skills,'matching_skills':overlap,'score':round(100*len(overlap)/max(1,len(stack))),'member':user['id'] in members})
  return sorted(matches,key=lambda item:(item['member'],item['score']),reverse=True)[:20]
@app.get('/api/projects/{id}/members')
def project_members(id:str):
 with conn() as c:return [dict(r) for r in c.execute('SELECT u.id AS user_id,u.name,u.skills,m.joined FROM project_members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY m.joined',(id,))]
class TaskAssignment(BaseModel):assignee_user_id:str|None
@app.patch('/api/projects/{id}/tasks/{task_id}/assign')
def assign_task(id:str,task_id:str,p:TaskAssignment,request:Request):
 with conn() as c:
  require_project_owner(c,id,request.state.user['id'])
  if p.assignee_user_id and not c.execute('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?',(id,p.assignee_user_id)).fetchone():raise HTTPException(400,'Tasks can only be assigned to accepted project collaborators.')
  changed=c.execute('UPDATE tasks SET assignee_user_id=? WHERE id=? AND project_id=?',(p.assignee_user_id,task_id,id))
  if not changed.rowcount:raise HTTPException(404,'Task not found.')
  return rowproject(c,id)
@app.get('/api/projects/{id}/download')
def download_project(id:str,request:Request):
 with conn() as c:
  p=c.execute('SELECT id,name,archive_path FROM projects WHERE id=?',(id,)).fetchone()
  if not p:raise HTTPException(404,'Project not found.')
  if p['archive_path'] and Path(p['archive_path']).is_file():archive_path=Path(p['archive_path']);archive=None
  else:
   buffer=io.BytesIO()
   with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as bundle:
    for row in c.execute('SELECT path,content FROM files WHERE project_id=?',(id,)):
     if safe_path(row['path']):bundle.writestr(row['path'],row['content'])
   archive=buffer.getvalue();archive_path=None
 project_name=re.sub(r'[^A-Za-z0-9._-]+','-',p['name']).strip('-') or 'project';user_id=request.state.user['id']
 async def body():
  if archive_path:
   with archive_path.open('rb') as stream:
    while chunk:=stream.read(64*1024):yield chunk
  else:
   for offset in range(0,len(archive),64*1024):yield archive[offset:offset+64*1024]
  with conn() as c:
   c.execute('UPDATE projects SET download_count=download_count+1 WHERE id=?',(id,))
   c.execute('INSERT INTO download_history(id,user_id,project_id,downloaded) VALUES(?,?,?,?) ON CONFLICT(user_id,project_id) DO UPDATE SET downloaded=excluded.downloaded',(uuid.uuid4().hex,user_id,id,now()))
 return StreamingResponse(body(),media_type='application/zip',headers={'Content-Disposition':f'attachment; filename="{project_name}.zip"','Cache-Control':'no-store'})
def analyse(files,description):
 paths=[f['path'] for f in files];contents='\n'.join(f['content'][:5000] for f in files)[:180000];names=' '.join(paths).lower();lower=contents.lower()
 signals={'React':any(x.endswith(('.jsx','.tsx')) for x in paths) or '"react"' in lower,'Python':any(x.endswith('.py') for x in paths),'JavaScript':any(x.endswith(('.js','.jsx')) for x in paths),'TypeScript':any(x.endswith(('.ts','.tsx')) for x in paths),'FastAPI':'fastapi' in lower,'Node.js':'package.json' in names,'Database':any(x in names for x in ['schema.sql','models.py','prisma','migration']) or any(x in lower for x in ['sqlite','postgres','mongodb','supabase']),'HTML/CSS':any(x.endswith(('.html','.css')) for x in paths)}
 stack=[k for k,v in signals.items() if v];findings=[];blockers=[]
 def add(title,detail,kind='info'):findings.append({'title':title,'detail':detail,'kind':kind})
 add('Source inventory',f'{len(files)} readable source/documentation files detected.')
 if not any(Path(x).name.lower().startswith('readme') for x in paths):blockers.append('README documentation is missing')
 if 'todo' in lower or 'fixme' in lower:blockers.append('TODO/FIXME markers detected in source')
 if any(x.endswith(('.jsx','.tsx')) for x in paths) and not any('package.json' in x for x in paths):blockers.append('Frontend package manifest not found')
 if not any('test' in x.lower() for x in paths):blockers.append('No test files detected')
 if not any(x.lower().endswith(('requirements.txt','package.json','pyproject.toml','pom.xml')) for x in paths):blockers.append('Dependency manifest not detected')
 for b in blockers:add('Potential gap',b,'warning')
 score=max(15,min(90,30+min(len(files),30)*2+(12 if any('readme' in x.lower() for x in paths) else 0)+(10 if any('test' in x.lower() for x in paths) else 0)-len(blockers)*5))
 direction='Continue' if score>=45 else 'Restart';reason=('The existing files provide a useful foundation. Address identified gaps incrementally.' if direction=='Continue' else 'The available project material is limited; rebuild a minimal foundation while reusing valuable parts.')
 context=re.search(r'pending:\s*([^\n]+)',lower)
 if context and context.group(1).strip():blockers.insert(0,'User-reported pending work: '+context.group(1).strip()[:180])
 return {'score':score,'score_label':'Heuristic readiness estimate (not verified completion)','stack':stack,'findings':findings,'blockers':blockers,'recommendation':direction,'reason':reason,'alternatives':['Continue','Restart','Pivot','Repurpose','Archive'],'file_count':len(files),'generated_at':now(),'method':'Local static heuristics; no code executed. Review recommendations manually.'}
class Direction(BaseModel):direction:str
async def ai_completion(messages,token_limit=1800,json_mode=False):
 api_key=os.getenv('OPENAI_API_KEY') or os.getenv('AI_API_KEY')
 if not api_key:raise HTTPException(503,'AI is not configured. Set OPENAI_API_KEY on the backend to enable AI features.')
 base=os.getenv('OPENAI_BASE_URL','https://api.openai.com/v1').rstrip('/');model=os.getenv('OPENAI_MODEL','gpt-4o-mini')
 payload={'model':model,'messages':messages,'temperature':0.2,'max_tokens':token_limit}
 if json_mode:payload['response_format']={'type':'json_object'}
 try:
  async with httpx.AsyncClient(timeout=55) as client:response=await client.post(f'{base}/chat/completions',headers={'Authorization':f'Bearer {api_key}','Content-Type':'application/json'},json=payload)
 except httpx.HTTPError:raise HTTPException(502,'Could not reach the configured AI provider.')
 if response.status_code>=400:raise HTTPException(502,'The configured AI provider rejected the request. Check the backend model and API configuration.')
 try:return response.json()['choices'][0]['message']['content']
 except (KeyError,IndexError,TypeError):raise HTTPException(502,'The AI provider returned an unsupported response.')
def ai_json(content):
 try:return json.loads(content)
 except (json.JSONDecodeError,TypeError):raise HTTPException(502,'The AI provider did not return valid structured data. No changes were saved.')
def require_project_owner(c,project_id,user_id):
 owner=c.execute('SELECT owner_id FROM projects WHERE id=?',(project_id,)).fetchone()
 if not owner:raise HTTPException(404,'Project not found')
 if owner['owner_id']!=user_id:raise HTTPException(403,'Only the project owner can perform this action.')
@app.post('/api/projects/{id}/ai/doctor')
async def ai_doctor(id:str,request:Request):
 with conn() as c:
  require_project_owner(c,id,request.state.user['id']);project=rowproject(c,id);files=[dict(r) for r in c.execute('SELECT path,content,size FROM files WHERE project_id=? ORDER BY path LIMIT 60',(id,))]
 evidence='\n'.join(f"--- {f['path']} ({f['size']} bytes) ---\n{f['content'][:3500]}" for f in files)[:85000]
 prompt={'name':project['name'],'description':project['description'],'category':project['category'],'technologies':project['technologies'],'reported_completion':project['completion'],'files':evidence}
 content=await ai_completion([{'role':'system','content':'You are a careful software project reviewer. Base findings only on supplied project metadata and source excerpts. Do not claim to have run code. Return JSON with keys score (integer 0-100), summary (string), health (string), missing_files (array of strings), dependency_gaps (array of strings), potential_errors (array of objects with file, issue, severity), incomplete_features (array of strings), improvements (array of strings), and explanations (array of strings). Clearly label uncertain inferences.'},{'role':'user','content':json.dumps(prompt)}],2200,True)
 review=ai_json(content)
 if not isinstance(review,dict) or not isinstance(review.get('score'),int) or not isinstance(review.get('summary'),str):raise HTTPException(502,'The AI provider returned an incomplete project review.')
 review['score']=max(0,min(100,review['score']));review['generated_at']=now();review['model']=os.getenv('OPENAI_MODEL','gpt-4o-mini')
 with conn() as c:c.execute('UPDATE projects SET ai_review=? WHERE id=?',(json.dumps(review),id))
 return review
@app.post('/api/projects/{id}/ai/roadmap')
async def ai_roadmap(id:str,p:Direction,request:Request):
 with conn() as c:
  require_project_owner(c,id,request.state.user['id']);project=rowproject(c,id)
 prompt={'project':project['name'],'description':project['description'],'direction':p.direction,'technologies':project['technologies'],'doctor_review':project['ai_review'],'existing_analysis':project['analysis'],'files':[f['path'] for f in project['files'][:80]]}
 content=await ai_completion([{'role':'system','content':'Create a practical project completion roadmap. Use only supplied evidence; phrase uncertain work as investigation. Return JSON object {"tasks":[{"title":"...","detail":"...","priority":"High|Medium|Low"}]}. Return 3 to 8 ordered tasks; keep titles concise and avoid generic filler.'},{'role':'user','content':json.dumps(prompt)}],1800,True)
 items=ai_json(content).get('tasks')
 if not isinstance(items,list) or not 3<=len(items)<=8:raise HTTPException(502,'The AI provider returned an invalid roadmap. Existing tasks were not changed.')
 tasks=[]
 for item in items:
  if not isinstance(item,dict) or not str(item.get('title','')).strip():raise HTTPException(502,'The AI provider returned an invalid task. Existing tasks were not changed.')
  priority=item.get('priority','Medium');priority=priority if priority in ('Low','Medium','High') else 'Medium'
  tasks.append((str(item['title']).strip()[:180],str(item.get('detail','')).strip()[:2000],priority))
 with conn() as c:
  require_project_owner(c,id,request.state.user['id']);c.execute('DELETE FROM tasks WHERE project_id=?',(id,))
  for index,(title,detail,priority) in enumerate(tasks):c.execute('INSERT INTO tasks(id,project_id,title,detail,priority,position) VALUES(?,?,?,?,?,?)',(uuid.uuid4().hex,id,title,detail,priority,index))
  c.execute('UPDATE projects SET direction=?,status=?,updated=? WHERE id=?',(p.direction,'Reviving',now(),id));return rowproject(c,id)
class ChatInput(BaseModel):message:str=Field(min_length=1,max_length=4000)
@app.get('/api/projects/{id}/ai/messages')
def ai_messages(id:str,request:Request):
 with conn() as c:return [dict(r) for r in c.execute('SELECT role,content,created FROM project_chat WHERE project_id=? AND user_id=? ORDER BY created',(id,request.state.user['id']))]
@app.post('/api/projects/{id}/ai/chat')
async def ai_chat(id:str,p:ChatInput,request:Request):
 with conn() as c:
  project=rowproject(c,id);files=[dict(r) for r in c.execute('SELECT path,content FROM files WHERE project_id=? ORDER BY path LIMIT 30',(id,))]
  history=[dict(r) for r in c.execute('SELECT role,content FROM project_chat WHERE project_id=? AND user_id=? ORDER BY created DESC LIMIT 10',(id,request.state.user['id']))]
 context={'name':project['name'],'description':project['description'],'technologies':project['technologies'],'files':[{'path':f['path'],'excerpt':f['content'][:1800]} for f in files]}
 messages=[{'role':'system','content':'You are the REVIVE-OS coding assistant. Help with this project using only the context below. Be direct, provide concrete suggestions and explain uncertainty. You cannot execute the code or inspect files not included here. Project context: '+json.dumps(context)}]
 messages.extend({'role':row['role'],'content':row['content']} for row in reversed(history));messages.append({'role':'user','content':p.message.strip()})
 answer=await ai_completion(messages,1400)
 if not isinstance(answer,str) or not answer.strip():raise HTTPException(502,'The AI provider returned an empty response.')
 created=now()
 with conn() as c:
  c.executemany('INSERT INTO project_chat(id,project_id,user_id,role,content,created) VALUES(?,?,?,?,?,?)',[(uuid.uuid4().hex,id,request.state.user['id'],'user',p.message.strip(),created),(uuid.uuid4().hex,id,request.state.user['id'],'assistant',answer.strip()[:12000],created)])
 return {'role':'assistant','content':answer.strip(),'created':created}
@app.post('/api/projects/{id}/analyse')
def autopsy(id:str):
 with conn() as c:
  p=rowproject(c,id);files=[dict(r) for r in c.execute('SELECT * FROM files WHERE project_id=?',(id,))];a=analyse(files,p['description']);c.execute('UPDATE projects SET analysis=?,status=?,updated=? WHERE id=?',(json.dumps(a),'Analysed',now(),id));return rowproject(c,id)
@app.post('/api/projects/{id}/roadmap')
def roadmap(id:str,p:Direction):
 if p.direction not in ['Continue','Restart','Pivot','Repurpose','Archive']:raise HTTPException(400,'Invalid direction')
 with conn() as c:
  project=rowproject(c,id);a=project['analysis']
  if not a:raise HTTPException(400,'Run project autopsy first')
  gaps=a.get('blockers',[])[:3]
  common={'Continue':[('Revisit existing source','Map working modules and document the current state'),('Resolve identified blockers','Address: '+('; '.join(gaps) or 'review and confirm pending work')),('Implement pending functionality','Complete the highest-value remaining feature'),('Test integration','Run manual functional tests and add automated tests'),('Deploy and document','Prepare a working demo and update README')], 'Restart':[('Define minimum viable scope','Write a smaller achievable specification'),('Reuse valuable assets','Identify reusable code and designs'),('Set up clean foundation','Initialize structure, dependencies and version control'),('Implement core user journey','Build and verify a complete vertical slice'),('Test and release','Document and demonstrate the new build')], 'Pivot':[('Identify transferable strengths','List reusable components and user needs'),('Choose new problem','Define revised audience and goal'),('Redesign minimal scope','Write new requirements'),('Adapt implementation','Reuse code where appropriate'),('Validate revised direction','Test with a sample user')], 'Repurpose':[('Inventory reusable modules','Identify independent components'),('Select new destination','Choose a suitable project'),('Isolate dependencies','Extract modules and document interfaces'),('Integrate reusable work','Connect components to destination'),('Test and document','Verify compatibility and usage')], 'Archive':[('Record current status','Summarize accomplishments and limitations'),('Preserve code and assets','Keep a stable copy'),('Document blockers','Explain why work stopped'),('Record future opportunities','Write possible next directions'),('Mark archived','Keep project searchable for later reuse')]}
  c.execute('DELETE FROM tasks WHERE project_id=?',(id,))
  for i,(title,detail) in enumerate(common[p.direction]):c.execute('INSERT INTO tasks(id,project_id,title,detail,priority,position) VALUES(?,?,?,?,?,?)',(uuid.uuid4().hex,id,title,detail,'High' if i<2 else 'Medium',i))
  c.execute('UPDATE projects SET direction=?,status=?,updated=? WHERE id=?',(p.direction,'Archived' if p.direction=='Archive' else 'Reviving',now(),id));return rowproject(c,id)
class ProjectEdit(BaseModel):
 name:str=Field(min_length=2,max_length=140)
 description:str=Field(default='',max_length=5000)
@app.patch('/api/projects/{id}')
def edit_project(id:str,p:ProjectEdit):
 with conn() as c:
  rowproject(c,id);c.execute('UPDATE projects SET name=?,description=?,updated=? WHERE id=?',(p.name.strip(),p.description,now(),id));return rowproject(c,id)
@app.get('/api/projects/{id}/files/{file_id}')
def inspect_file(id:str,file_id:str):
 with conn() as c:
  rowproject(c,id);r=c.execute('SELECT path,content,size FROM files WHERE project_id=? AND id=?',(id,file_id)).fetchone()
  if not r:raise HTTPException(404,'File not found')
  return dict(r)
class NewTask(BaseModel):
 title:str=Field(min_length=2,max_length=180)
 detail:str=Field(default='',max_length=2000)
 priority:str='Medium'
@app.post('/api/projects/{id}/tasks')
def add_task(id:str,p:NewTask):
 if p.priority not in ('Low','Medium','High'):raise HTTPException(400,'Invalid priority')
 with conn() as c:
  project=rowproject(c,id)
  pos=c.execute('SELECT COALESCE(MAX(position),-1)+1 FROM tasks WHERE project_id=?',(id,)).fetchone()[0]
  c.execute('INSERT INTO tasks(id,project_id,title,detail,priority,position) VALUES(?,?,?,?,?,?)',(uuid.uuid4().hex,id,p.title.strip(),p.detail,p.priority,pos))
  c.execute('UPDATE projects SET status=?,updated=? WHERE id=?',('Reviving',now(),id));return rowproject(c,id)
@app.delete('/api/projects/{id}/tasks/{task_id}')
def remove_task(id:str,task_id:str):
 with conn() as c:
  rowproject(c,id);r=c.execute('DELETE FROM tasks WHERE project_id=? AND id=?',(id,task_id))
  if not r.rowcount:raise HTTPException(404,'Task not found')
  c.execute('UPDATE projects SET updated=? WHERE id=?',(now(),id));return rowproject(c,id)
class TaskUpdate(BaseModel):done:bool
@app.patch('/api/projects/{id}/tasks/{task_id}')
def update_task(id:str,task_id:str,p:TaskUpdate):
 with conn() as c:
  rowproject(c,id);r=c.execute('UPDATE tasks SET done=? WHERE id=? AND project_id=?',(int(p.done),task_id,id))
  if not r.rowcount:raise HTTPException(404,'Task not found')
  remaining=c.execute('SELECT COUNT(*) FROM tasks WHERE project_id=? AND done=0',(id,)).fetchone()[0];c.execute('UPDATE projects SET status=?,updated=? WHERE id=?',('Completed' if remaining==0 else 'Reviving',now(),id));return rowproject(c,id)
class Notes(BaseModel):notes:str=Field(max_length=10000)
@app.patch('/api/projects/{id}/notes')
def notes(id:str,p:Notes):
 with conn() as c:rowproject(c,id);c.execute('UPDATE projects SET notes=?,updated=? WHERE id=?',(p.notes,now(),id));return rowproject(c,id)
@app.delete('/api/projects/{id}')
def delete(id:str):
 with conn() as c:rowproject(c,id);c.execute('DELETE FROM projects WHERE id=?',(id,));return {'deleted':True}
@app.get('/api/projects/{id}/export')
def export(id:str):
 with conn() as c:p=rowproject(c,id)
 return StreamingResponse(io.BytesIO(json.dumps(p,indent=2).encode()),media_type='application/json',headers={'Content-Disposition':f'attachment; filename="revive-{id[:8]}.json"'})
@app.get('/api/projects/{id}/report.pdf')
def report(id:str):
 with conn() as c:p=rowproject(c,id)
 buf=io.BytesIO();pdf=canvas.Canvas(buf,pagesize=(595,842));y=800
 def line(s,step=19):
  nonlocal y
  for chunk in [str(s)[i:i+90] for i in range(0,len(str(s)),90)] or ['']:
   if y<55:pdf.showPage();y=800
   pdf.drawString(45,y,chunk.encode('latin-1','replace').decode('latin-1'));y-=step
 pdf.setFont('Helvetica-Bold',19);line('REVIVE OS | Project Revival Report',32);pdf.setFont('Helvetica',10)
 for k in ['name','description','source','status','direction','notes']:line(f'{k.title()}: {p[k]}')
 a=p['analysis'];line('AUTOPSY',24);line(f"Readiness estimate: {a.get('score','Not analysed')}")
 for x in a.get('findings',[]):line(f"- {x['title']}: {x['detail']}")
 line(f"Recommendation: {a.get('recommendation','Not analysed')}");line(a.get('reason',''))
 line('ROADMAP',24)
 for t in p['tasks']:line(f"[{'X' if t['done'] else ' '}] {t['title']} - {t['detail']}")
 pdf.save();buf.seek(0);return StreamingResponse(buf,media_type='application/pdf',headers={'Content-Disposition':f'attachment; filename="revive-{id[:8]}.pdf"'})
