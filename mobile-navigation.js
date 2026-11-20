/* Aureum Tipoff: accessible mobile navigation */
(()=>{'use strict';
 const toggle=document.getElementById('mobileMenuToggle');
 const nav=document.getElementById('siteNavigation');
 if(!toggle||!nav)return;
 const mq=window.matchMedia('(max-width: 850px)');
 function setOpen(open){
  const active=!!open&&mq.matches;
  nav.classList.toggle('is-open',active);
  document.body.classList.toggle('mobile-menu-open',active);
  toggle.setAttribute('aria-expanded',String(active));
  toggle.setAttribute('aria-label',active?'Close navigation':'Open navigation');
  const caption=toggle.querySelector('.menu-caption');if(caption)caption.textContent=active?'Close':'Menu';
 }
 toggle.addEventListener('click',()=>setOpen(toggle.getAttribute('aria-expanded')!=='true'));
 nav.addEventListener('click',e=>{if(e.target.closest('[data-page]'))setOpen(false);});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&toggle.getAttribute('aria-expanded')==='true'){setOpen(false);toggle.focus();}});
 document.addEventListener('pointerdown',e=>{if(mq.matches&&toggle.getAttribute('aria-expanded')==='true'&&!nav.contains(e.target)&&!toggle.contains(e.target))setOpen(false);});
 window.addEventListener('hashchange',()=>setOpen(false));
 mq.addEventListener('change',()=>setOpen(false));
})();
