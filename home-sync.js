const fingerprint=async p=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(p))))).map(v=>v.toString(16).padStart(2,'0')).join('');
export function createHomeSync({getProject,canLeave,isBusy,applyRemote,importCopy,connectRemote,notify}){
  let token='',username='',base='',running=false,automatic=false,autoOwner=null;
  const dialog=document.createElement('dialog');dialog.className='field-hub';document.body.append(dialog);
  const button=document.createElement('button');button.className='btn btn-ghost';button.textContent='Домашний сервер';document.querySelector('.sidebar-footer').prepend(button);
  const key=id=>'kontur-sync:'+JSON.stringify([base,username,id]);
  const meta=id=>{try{return JSON.parse(localStorage.getItem(key(id)))??null;}catch{return null;}};
  const saveMeta=(id,data)=>localStorage.setItem(key(id),JSON.stringify(data));
  function status(text){button.textContent=text;const s=dialog.querySelector('[data-status]');if(s)s.textContent=text;}
  async function request(route,options={}){
    const response=await fetch(base+'/api/'+route,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...options.headers},signal:AbortSignal.timeout(30000)});
    const result=await response.json();if(!response.ok){const error=new Error(result.error||'Ошибка домашнего сервера');error.status=response.status;throw error;}return result;
  }
  async function sync(manual=false){
    if(!token||running||isBusy())return;if(manual&&!await canLeave())return;
    running=true;status('Синхронизация…');
    try{
      const p=structuredClone(getProject()),localHash=await fingerprint(p),previous=meta(p.id);let remote;
      try{remote=await request('projects/'+encodeURIComponent(p.id));}catch(e){if(e.status!==404)throw e;}
      if(getProject().id!==p.id||isBusy()||await fingerprint(getProject())!==localHash){status('Есть новые изменения — повторим обмен');return;}
      if(!remote){const saved=await request('projects/'+encodeURIComponent(p.id),{method:'PUT',body:JSON.stringify({project:p,revision:0})});saveMeta(p.id,{revision:saved.revision,hash:localHash});}
      else if(await fingerprint(remote.project)===localHash)saveMeta(p.id,{revision:remote.revision,hash:localHash});
      else if(previous?.revision===remote.revision){const saved=await request('projects/'+encodeURIComponent(p.id),{method:'PUT',body:JSON.stringify({project:p,revision:remote.revision})});saveMeta(p.id,{revision:saved.revision,hash:localHash});}
      else if(previous?.hash===localHash){await applyRemote(remote.project);saveMeta(p.id,{revision:remote.revision,hash:await fingerprint(getProject())});}
      else {automatic=false;throw new Error('Конфликт версий: изменения есть на обоих устройствах. Ничего не перезаписано. Откройте серверную версию как отдельный объект и сравните записи.');}
      status('Сохранено на домашнем сервере');
    }catch(e){if(e.status===401){token='';automatic=false;}status(e.message.includes('Конфликт')?e.message:'Нет синхронизации: '+e.message);if(manual)notify(e.message,true);}
    finally{running=false;}
  }
  async function show(){
    if(!await canLeave())return;
    dialog.innerHTML='<div class="dialog-head"><h2>Домашний сервер</h2><button class="icon-btn" data-close aria-label="Закрыть">×</button></div><div class="dialog-body"><p>Сервер ещё нужно установить на вашем оборудовании. Данные передаются только на указанный адрес после входа. Пароль не сохраняется в браузере.</p><form data-login><label>HTTPS-адрес сервера<input name="address" type="url" required placeholder="https://kontur.example.ru"></label><label>Пользователь<input name="username" autocomplete="username" required></label><label>Пароль<input name="password" type="password" autocomplete="current-password" required></label><button class="btn btn-primary">Войти</button></form><p data-status role="status"></p><div class="field-tabs"><button class="btn btn-secondary" data-sync>Синхронизировать объект</button><button class="btn btn-secondary" data-list>Объекты на сервере</button><button class="btn btn-ghost" data-logout>Выйти</button></div><label><input type="checkbox" data-auto> Автоматический обмен каждые 30 секунд, пока приложение открыто</label><div data-projects></div></div>';
    dialog.querySelector('[name=address]').value=base||localStorage.getItem('kontur-server-url')||'';dialog.querySelector('[name=username]').value=username;dialog.querySelector('[data-auto]').checked=automatic;status(token?'Подключено: '+username:'Сервер не подключён');dialog.showModal();
  }
  button.addEventListener('click',()=>show().catch(e=>notify(e.message,true)));
  dialog.addEventListener('submit',async e=>{e.preventDefault();const form=e.target,submit=form.querySelector('button');submit.disabled=true;try{
    if(running)throw new Error('Дождитесь текущего обмена.');const url=new URL(form.address.value);if(url.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(url.hostname))throw new Error('Для передачи данных нужен HTTPS.');if(url.username||url.password||url.search||url.hash||url.pathname!=='/')throw new Error('Укажите только адрес сервера, без пути и пароля.');
    token='';automatic=false;base=url.origin;const result=await request('login',{method:'POST',body:JSON.stringify({username:form.username.value,password:form.password.value})});token=result.token;username=result.username;form.password.value='';localStorage.setItem('kontur-server-url',base);status('Подключено: '+username);
  }catch(e){status(e.message);}finally{submit.disabled=false;}});
  dialog.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b)return;try{
    if(b.hasAttribute('data-close'))dialog.close();
    if(b.hasAttribute('data-sync'))await sync(true);
    if(b.hasAttribute('data-logout')){automatic=false;try{await request('logout',{method:'POST'});}finally{token='';status('Вы вышли с сервера');}}
    if(b.hasAttribute('data-list')){const data=await request('projects'),list=dialog.querySelector('[data-projects]');list.replaceChildren();for(const p of data.projects){const item=document.createElement('button');item.className='draft-queue-item';item.textContent=p.name+' — открыть отдельной копией';item.onclick=async()=>{try{if(running)return;const data=await request('projects/'+encodeURIComponent(p.id));dialog.close();await importCopy(data.project);}catch(e){notify(e.message,true);}};list.append(item);const connect=document.createElement('button');connect.className='btn btn-secondary';connect.textContent='Подключить этот объект для синхронизации';connect.onclick=async()=>{try{if(running)return;const data=await request('projects/'+encodeURIComponent(p.id));dialog.close();const ok=await connectRemote(data.project);if(ok){saveMeta(data.project.id,{revision:data.revision,hash:await fingerprint(getProject())});status('Объект подключён к серверу');}}catch(e){notify(e.message,true);}};list.append(connect);}if(!data.projects.length)list.textContent='На сервере пока нет объектов.';}
  }catch(e){status(e.message);}});
  dialog.addEventListener('change',e=>{if(e.target.hasAttribute('data-auto')){automatic=!!token&&e.target.checked;autoOwner=getProject().id;e.target.checked=automatic;if(!token)status('Сначала войдите на сервер.');}});
  setInterval(()=>{if(automatic&&getProject().id===autoOwner&&!document.hidden)void sync();},30000);
  window.addEventListener('online',()=>{if(automatic&&getProject().id===autoOwner)void sync();});
  return {get busy(){return running;}};
}
