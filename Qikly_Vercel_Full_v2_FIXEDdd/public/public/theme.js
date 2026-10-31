(function(){
  const key="qikly-theme";
  const saved=localStorage.getItem(key);
  const theme=saved==="dark"?"dark":"light";
  document.documentElement.setAttribute("data-theme",theme);
  window.qiklyTheme={
    get(){return document.documentElement.getAttribute("data-theme")||"light"},
    set(v){const next=v==="dark"?"dark":"light";document.documentElement.setAttribute("data-theme",next);localStorage.setItem(key,next);window.dispatchEvent(new CustomEvent("qikly-theme-change",{detail:next}));}
  };
  document.addEventListener("click",e=>{
    const b=e.target.closest("[data-theme-toggle]");
    if(!b)return;
    qiklyTheme.set(qiklyTheme.get()==="dark"?"light":"dark");
  });
  function sync(){document.querySelectorAll("[data-theme-toggle]").forEach(b=>{
    const dark=qiklyTheme.get()==="dark";
    b.setAttribute("aria-label",dark?"Switch to light mode":"Switch to dark mode");
    b.textContent=dark?"☀":"☾";
  });}
  window.addEventListener("qikly-theme-change",sync); document.addEventListener("DOMContentLoaded",sync);
})();
