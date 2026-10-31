(function(){
  const path=(location.pathname||'/').replace(/\/$/,'')||'/';
  const links=document.querySelectorAll('[data-float-nav] a[data-nav]');
  links.forEach(a=>{
    const target=a.getAttribute('href');
    const active=(target==='/'&&path==='/')||(target!=='/'&&path===target);
    a.classList.toggle('active',active);
    if(active) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current');
  });
  const avatar=document.querySelector('[data-dock-avatar]');
  async function load(){
    if(!avatar) return;
    try{
      const r=await fetch('/api/auth/me',{cache:'no-store'}), d=await r.json();
      if(d.authenticated && d.user){
        const name=String(d.user.name||'Q').trim();
        const initials=name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase()||'Q';
        avatar.textContent=initials;
        avatar.classList.add('has-user');
      }
    }catch{}
  }
  load();
})();
