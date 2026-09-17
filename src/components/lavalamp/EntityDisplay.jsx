import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './EntityDisplay.css';
import { sampleInkTargets, INK_HANDOFF, INK_ROW_DELAY, inkRevealFront } from './inkTargets';
import MothermoldAssembly from './MothermoldAssembly';

const MeshwrightStage3D = lazy(() => import('./MeshwrightStage3D'));
const SeenaPortrait3D = lazy(() => import('./SeenaPortrait3D'));

function ProjectDiagram({ type, label }) {
  const isEnterprise = type === 'enterprise';
  const nodes = isEnterprise
    ? ['30+ facilities', 'Angular filing UI', 'FastAPI services', 'SQL + Redis', 'Azure delivery']
    : ['Field teams', 'React Native', 'Express API', 'PostgreSQL', 'GCP + Docker'];
  return <div className={`project-diagram project-diagram--${type}`} role="img" aria-label={label}>
    <div className="project-diagram__rail" aria-hidden="true" />
    <div className="project-diagram__title">
      <span>{isEnterprise ? 'Production system / enterprise scale' : 'Functional MVP / field operations'}</span>
      <strong>{isEnterprise ? 'Document flow' : 'Safety workflow'}</strong>
    </div>
    <div className="project-diagram__nodes">
      {nodes.map((node, index) => <div className="project-diagram__node" key={node}>
        <span>{String(index + 1).padStart(2, '0')}</span><strong>{node}</strong>
      </div>)}
    </div>
    <div className="project-diagram__caption">
      <span>{isEnterprise ? 'Paper + legacy workflows' : 'Training · certifications · inspections'}</span>
      <span aria-hidden="true">→</span>
      <span>{isEnterprise ? 'Cloud platform' : 'One field application'}</span>
    </div>
  </div>;
}

const meshwrightStages = [
  { label: 'Text', number: '01', prompt: true },
  { label: 'Image', number: '02', image: '/projects/meshwright/generated-reference.png', alt: 'Generated Dust Saint character reference in an arms-out pose' },
  { label: '3D', number: '03', image: '/projects/meshwright/mesh-preview.png', alt: 'Reconstructed Dust Saint 3D mesh', mode: 'mesh' },
  { label: 'Rig', number: '04', image: '/projects/meshwright/rig-pose.png', alt: 'Dust Saint rig with its skeleton visible', mode: 'rig' },
  { label: 'Motion', number: '05', image: '/projects/meshwright/corrected-walk.png', alt: 'Dust Saint performing the corrected walk animation', mode: 'motion' },
];

function MeshwrightStageMedia({ stage }) {
  return stage.prompt ? <div className="mesh-pipeline__brief">
        <blockquote>“A lean, wiry, tall adult man… weathered desert drifter, pale ash-beige dust-worn skin…”</blockquote>
        <small>Prompt + posed base-body guide</small>
      </div> : stage.mode ? <Suspense fallback={<img src={stage.image} alt={stage.alt} decoding="async" />}>
        <MeshwrightStage3D mode={stage.mode} fallback={stage.image} alt={stage.alt} />
      </Suspense> : <img src={stage.image} alt={stage.alt} decoding="async" />;
}

function MeshwrightPipeline() {
  const [compact, setCompact] = useState(() => window.matchMedia('(max-width: 1100px)').matches);
  const [active, setActive] = useState(4);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1100px)');
    const update = () => setCompact(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  if (compact) {
    return <div className="mesh-mobile" aria-label="Dust Saint pipeline: text to image to 3D to rig to motion">
      <div className="mesh-mobile__steps" role="group" aria-label="Pipeline stages">
        {meshwrightStages.map((stage, index) => <button type="button" key={stage.label} aria-pressed={active === index} onClick={() => setActive(index)}><small>{stage.number}</small>{stage.label}</button>)}
      </div>
      <div className="mesh-mobile__media" key={meshwrightStages[active].label}>
        <MeshwrightStageMedia stage={meshwrightStages[active]} />
      </div>
    </div>;
  }
  return <ol className="mesh-pipeline" aria-label="Dust Saint pipeline: text to image to 3D to rig to motion">
    {meshwrightStages.map((stage) => <li className={`mesh-pipeline__stage${stage.prompt ? ' mesh-pipeline__stage--text' : ''}${stage.mode ? ' mesh-pipeline__stage--interactive' : ''}`} key={stage.label}>
      <div className="mesh-pipeline__stage-heading"><span>{stage.number}</span><strong>{stage.label}</strong></div>
      <MeshwrightStageMedia stage={stage} />
    </li>)}
  </ol>;
}

function ProjectMedia({ item }) {
  if (item.renderer === 'meshwright') {
    return <MeshwrightPipeline />;
  }
  if (item.renderer === 'diagram') {
    return <ProjectDiagram type={item.diagramType} label={item.previewAlt || item.imageAlt} />;
  }
  if (item.renderer === 'mothermold') {
    return <MothermoldAssembly fallback={item.image} label={item.previewAlt || item.imageAlt} />;
  }
  if (item.video) {
    return <video
      className="project-demo-video"
      poster={item.image}
      autoPlay
      muted
      loop
      playsInline
      controls
      preload="metadata"
      aria-label={item.videoAlt || item.imageAlt}
    >
      <source src={item.video} type="video/mp4" />
      <a href={item.demo}>Watch the Mynah demo</a>
    </video>;
  }
  return <img src={item.image} alt={item.imageAlt} decoding="async" />;
}

function ProjectContent({ item, chapter, headingRef }) {
  const [view, setView] = useState('visual');
  return <div className={`project-content${item.proofs ? ' has-evidence' : ''}`} data-view={view}>
    <div className="project-heading">
      <h1 ref={headingRef} tabIndex={-1}>{item.label}</h1>
      <div className="project-spec"><span>{String(chapter + 1).padStart(2, '0')} / {item.origin}</span><span>{item.kind} · {item.status}</span></div>
    </div>
    <div className="project-view-switch" role="group" aria-label="Project view">
      {['visual', 'story', 'details'].map((option) => <button key={option} type="button" aria-pressed={view === option} onClick={() => setView(option)}>{option}</button>)}
    </div>
    <figure className={`project-visual${item.visualStyle ? ` project-visual--${item.visualStyle}` : ''}`} key={item.video || item.image}>
      <ProjectMedia item={item} />
    </figure>
    {item.proofs && <div className="project-evidence" aria-label={`${item.label} evidence`}>
      {item.proofs.map((proof) => <div key={proof.label}><strong>{proof.value}</strong><span>{proof.label}</span></div>)}
    </div>}
    <div className="project-overview" aria-live="polite" aria-atomic="true">
      <div className="project-summary">
        <h2>{item.title}</h2>
        <p className="entity-intro">{item.intro}</p>
        {(item.href || item.demo) && <div className="entity-project-links">
          {item.href && <a className="entity-link" href={item.href} target="_blank" rel="noreferrer">{item.linkLabel || 'GitHub'} <span aria-hidden="true">↗</span></a>}
          {item.demo && <a className="entity-link entity-link--secondary" href={item.demo} target="_blank" rel="noreferrer">Demo <span aria-hidden="true">▶</span></a>}
        </div>}
      </div>
      <div className="entity-detail">
        <h2>{item.detail}</h2>
        <p>{item.body}</p>
        <div className="entity-tags">{item.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
      </div>
    </div>
  </div>;
}

function SeenaRole({ role, onOpenProject }) {
  return <article className="seena-role">
    <div className="seena-role__heading"><h2>{role.organization}</h2><span>{role.period}</span></div>
    <p className="seena-role__title">{role.title}</p>
    <p className="seena-role__body">{role.body}</p>
    {role.href && <a className="entity-link seena-role__link" href={role.href} target="_blank" rel="noreferrer">{role.linkLabel}<span aria-hidden="true">↗</span></a>}
    {role.project && <button type="button" className="entity-link seena-role__link" onClick={onOpenProject}>View document platform project<span aria-hidden="true">↗</span></button>}
  </article>;
}

function SeenaProfile({ data, headingRef, onOpenProject, phase, transfer }) {
  const [panel, setPanel] = useState('Intro');
  const panels = ['Intro', ...data.experience.map((role) => role.organization === 'River City Foundry' ? 'Foundry' : role.organization), 'Capabilities', 'Education'];
  const role = panel === 'Foundry' ? data.experience[0] : panel === 'Chevron Corporation' ? data.experience[1] : null;
  return <div className="seena-profile">
    <div className="seena-profile__tabs" role="group" aria-label="Seena profile views">
      {panels.map((name) => <button type="button" key={name} aria-pressed={panel === name} onClick={() => setPanel(name)}>{name === 'Chevron Corporation' ? 'Chevron' : name}</button>)}
    </div>
    <div className="seena-profile__hero">
      <div className="seena-profile__opening">
        <h1 ref={headingRef} tabIndex={-1}>{data.title}</h1>
        <div className="seena-profile__panel" aria-live="polite">
          {panel === 'Intro' && <p className="seena-profile__intro">{data.intro}</p>}
          {role && <SeenaRole role={role} onOpenProject={onOpenProject} />}
          {panel === 'Capabilities' && <section className="seena-profile__section"><h2>Capabilities</h2><p>{data.capabilities}</p></section>}
          {panel === 'Education' && <section className="seena-profile__section"><h2>Education</h2><p>{data.education}</p></section>}
        </div>
        <div className="seena-profile__desktop">
          <p className="seena-profile__intro">{data.intro}</p>
          <div className="seena-profile__roles">
            {data.experience.map((experience) => <SeenaRole key={experience.organization} role={experience} onOpenProject={onOpenProject} />)}
          </div>
          <div className="seena-profile__facts">
            <section className="seena-profile__section"><h2>Capabilities</h2><p>{data.capabilities}</p></section>
            <section className="seena-profile__section"><h2>Education</h2><p>{data.education}</p></section>
          </div>
        </div>
      </div>
      <Suspense fallback={<figure className="seena-portrait" aria-label="Loading portrait" aria-busy="true" />}>
        <SeenaPortrait3D phase={phase} transfer={transfer} />
      </Suspense>
    </div>
  </div>;
}

const sections = {
  0: {
    label: 'Projects', slug: 'projects', eyebrow: 'Production systems + selected independent work', title: 'Selected\nprojects',
    chapters: [
      {
        label: 'Chevron', word: 'Chevron', title: 'Enterprise scale.\nProduction stakes.',
        origin: 'Professional system', kind: 'Enterprise platform', status: 'Software Engineer · 2022–2025',
        intro: 'A global document platform replacing paper and legacy workflows across more than 30 facilities and over one million documents each year.',
        detail: 'Owned the filing front end and release pipeline; contributed to the FastAPI services and SQL data layer.',
        body: 'The work spanned Angular and TypeScript interfaces, Python and FastAPI services, Redis, Azure deployment, containerization, production support, and security remediation. A separate PowerShell retention workflow used parallel execution to move 1.2 million records through a compliance deadline in about three hours instead of about 48.',
        tags: ['Angular', 'TypeScript', 'Python', 'FastAPI', 'Azure', 'Docker'],
        renderer: 'diagram', diagramType: 'enterprise', visualStyle: 'diagram',
        imageAlt: 'Reconstructed architecture diagram of the Chevron document platform; no confidential interface or data is shown',
        privateLabel: 'Enterprise work', privateNote: 'No confidential assets',
        proofs: [
          { value: '1M+', label: 'documents each year' },
          { value: '30+', label: 'global facilities' },
          { value: '48h → ~3h', label: 'retention workflow' },
          { value: '4', label: 'engineers mentored' },
        ],
      },
      {
        label: 'Meshwright', word: 'Meshwright', title: 'Agents that\nbuild in 3D.',
        origin: 'Open-source project', kind: 'AI infrastructure', status: 'Alpha · MIT licensed',
        intro: 'A review-gated, restart-safe system that turns prompts and references into validated 3D deliverables. The visual follows one real Dust Saint character run.',
        detail: 'From generated reference to corrected character motion.',
        body: 'The Dust Saint run used a text-guided image and posed base-body guide, then prepared the reference, reconstructed and cleaned a mesh, fitted a reusable humanoid rig, and checked corrected idle and walk clips for hand-body contact. Meshwright also provides checkpointed orchestration, review gates, recovery, and export across its broader 3D workflows.',
        tags: ['Python', 'LangGraph', 'FastAPI', 'SQLite', 'Blender', 'GPU serving'],
        image: '/projects/meshwright/corrected-walk.png', imageAlt: 'Dust Saint character pipeline from generated reference through corrected walk animation', renderer: 'meshwright', visualStyle: 'pipeline',
        href: 'https://github.com/seena18/meshwright',
        proofs: [
          { value: 'Restart-safe', label: 'persisted job recovery' },
          { value: '5 formats', label: 'GLB · FBX · OBJ · STL · USDZ' },
          { value: '81 tests', label: 'repository test functions' },
        ],
      },
      {
        label: 'Field Safety', word: 'Field Safety', title: 'A field product.\nOwned end to end.',
        origin: 'Client product', kind: 'Pre-seed B2B product', status: 'Functional MVP',
        intro: 'A cross-platform safety-management product delivered in under six months and piloted with 50 employees.',
        detail: 'Product definition, mobile workflows, backend architecture, data migration, identity, and rollout preparation.',
        body: 'The React Native application brought toolbox talks, certifications, inspections, document retention, and tickets into one place. The system ran on Express, PostgreSQL, GCP, and Docker, with claims-based authorization across five permission tiers plus phone and email MFA. Migrating from the NoSQL prototype to PostgreSQL cut response times by up to 50%.',
        tags: ['React Native', 'TypeScript', 'Express', 'PostgreSQL', 'GCP', 'RBAC'],
        renderer: 'diagram', diagramType: 'field', visualStyle: 'diagram',
        imageAlt: 'Reconstructed system diagram of the field-safety platform; no client-confidential interface or data is shown',
        privateLabel: 'Client product', privateNote: 'Reconstructed case study',
        proofs: [
          { value: '50', label: 'employees in pilot' },
          { value: '< 6 months', label: 'to functional MVP' },
          { value: 'Up to 50%', label: 'faster responses' },
          { value: '5 tiers', label: 'claims-based permissions' },
        ],
      },
      {
        label: '404Leads', word: '404Leads', title: 'Find the gap.\nBuild the lead.',
        origin: 'Private product', kind: 'Lead intelligence', status: '2026',
        intro: 'Search a market by map, find businesses without a credible web presence, and turn raw place data into reviewable leads.',
        detail: 'Lead discovery that shows its evidence.',
        body: '404Leads turns map regions into a streaming discovery and verification workflow. It tiles searches, deduplicates businesses, cross-checks web presence and identity evidence, and moves qualified opportunities into a realtime, user-isolated lead pipeline—with durable workers and cost circuit breakers behind it.',
        tags: ['Next.js', 'TypeScript', 'Supabase', 'Leaflet'],
        image: '/projects/404leads.webp', imageAlt: '404Leads map search interface showing potential local-business leads', visualStyle: 'dashboard',
        private: true,
      },
      {
        label: 'DaveTrader', word: 'DaveTrader', title: 'Market judgment.\nMade legible.',
        origin: 'Private product', kind: 'Decision intelligence', status: 'Beta · 2026',
        intro: 'A live market workspace that turns a veteran trader’s playbook into explainable signals, research, and strategy tools.',
        detail: 'Decision support that shows its work.',
        body: 'DaveTrader combines live market data, portfolio and news views, strategy inspection, backtesting, and an optimizer lab. Every recommendation exposes its context, validation points, and invalidation logic so the signal can be audited instead of trusted as a black box.',
        tags: ['Next.js', 'TypeScript', 'Market data', 'Strategy tooling'],
        image: '/projects/davetrader.png', imageAlt: 'DaveTrader explainable market intelligence interface', visualStyle: 'dashboard',
        href: 'https://davestrades-web.vercel.app', linkLabel: 'Visit the live product',
      },
      {
        label: 'Mynah', word: 'Mynah', title: 'Local voice.\nLine by line.',
        origin: 'Open-source project', kind: 'Local AI tool', status: 'v1.0.1',
        intro: 'Record or upload a voice, shape a script as independent lines, reroll one bad take, and export the finished narration.',
        detail: 'Voice cloning that stays on your machine.',
        body: 'Mynah wraps Chatterbox Turbo in a self-hosted editor. Fingerprinted takes and a single generation queue make local inference practical: changing one line never means regenerating the whole project.',
        tags: ['Python', 'FastAPI', 'Local inference', 'Audio UX'],
        image: '/projects/mynah.png', imageAlt: 'Mynah line-by-line local voice generation interface',
        video: '/projects/mynah-demo-v1.0.1.mp4', videoAlt: 'Mynah demo showing local voice recording, line-by-line generation, take selection, and export', visualStyle: 'video',
        href: 'https://github.com/seena18/mynah', demo: 'https://github.com/seena18/mynah/releases/download/v1.0.1/mynah-demo-v1.0.1.mp4',
      },
      {
        label: 'Mothermold', word: 'Mothermold', title: 'From mesh\nto mold.',
        origin: 'Open-source project', kind: 'Digital fabrication', status: 'Alpha',
        intro: 'Turn an STL into a reusable, 3D-printable silicone mold system with inspectable geometry and reproducible settings.',
        detail: 'Fabrication tooling with geometry you can verify.',
        body: 'Mothermold generates the containment jacket, lid, displacement core, model lugs, cutaway inspections, and a print package. Its browser-native studio runs repair, sampling, booleans, interference checks, and export on-device.',
        tags: ['Python', 'Blender', 'Mesh processing', 'Browser CAD'],
        image: '/projects/mothermold.png', imageAlt: 'A rendered Mothermold containment jacket and mold assembly',
        renderer: 'mothermold', previewAlt: 'A live generated Mothermold assembly rotating, separating into its printable parts, and returning together', visualStyle: 'sequence',
        href: 'https://github.com/seena18/mothermold',
      },
    ],
  },
  1: {
    label: 'Seena', slug: 'about', title: 'Seena Abed',
    intro: 'I build complete products across full-stack engineering, cloud infrastructure, and applied AI—from product definition through deployment.',
    experience: [
      {
        organization: 'River City Foundry', title: 'Independent Software Engineer & Product Builder', period: 'Jan 2025–present',
        body: 'My commercial studio for web and mobile products. I own product definition, architecture, implementation, testing, and delivery across client systems.',
        href: 'https://rivercityfoundry.vercel.app', linkLabel: 'Visit River City Foundry',
      },
      {
        organization: 'Chevron Corporation', title: 'Software Engineer', period: 'Jun 2022–Aug 2025',
        body: 'Built and operated production software across global facilities, supported cloud releases and compliance work, and mentored four engineers.',
        project: true,
      },
    ],
    capabilities: 'TypeScript, React, React Native, Angular, Next.js, Python, FastAPI, Express, PostgreSQL, Supabase, Docker, Azure, GCP, LangGraph, Blender, and GPU serving.',
    education: 'B.S. Computer Science with Honors · Cal Poly San Luis Obispo · 3.9 GPA.',
  },
  4: {
    label: 'Contact', eyebrow: '', title: 'Contact.',
    intro: 'Sacramento–Folsom, CA · Open to remote or hybrid product engineering, full-stack, forward-deployed, and applied-AI roles.',
    chapters: [
      { label: 'Connect', word: 'Start a\nconversation.', detail: 'The shortest path is email.', body: 'Reach out about product engineering, full-stack systems, forward-deployed work, applied AI, or a technically difficult product that needs broad ownership.', tags: ['Roles', 'Products', 'Technical systems'] },
      { label: 'Source', word: 'Open it.\nLook inside.', detail: 'The work is inspectable.', body: 'Explore the public repositories behind Meshwright, Mothermold, Mynah, and this portfolio’s fluid interaction system.', tags: ['GitHub', 'Open source', 'Technical evidence'] },
    ],
  },
};

export default function EntityDisplay({ section, phase, opacity, onInteract, onOpenProject, onBack, transfer }) {
  const data = sections[section];
  const [chapter, setChapter] = useState(0);
  const headingRef = useRef(null);
  const scrollRef = useRef(null);
  const storyRef = useRef(null);
  const ready = phase === 'rect';
  const item = data.chapters?.[chapter];

  useLayoutEffect(() => {
    const aim = () => {
      const title = headingRef.current.getBoundingClientRect();
      transfer.current.target = { x: title.left + Math.min(70, title.width * .2), y: title.top + 30 };
      transfer.current.scrollTop = scrollRef.current.scrollTop;
      const story = storyRef.current.getBoundingClientRect();
      transfer.current.offset = { x: story.left, y: story.top };
      transfer.current.contentBounds = { left: story.left, right: story.right };
    };
    aim();
    transfer.current.story = storyRef.current;
    transfer.current.overlay = scrollRef.current;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const progress = transfer.current.progress ?? Infinity;
    storyRef.current.style.setProperty('--ink-front', `${reducedMotion ? 125 : inkRevealFront(progress)}%`);
    storyRef.current.style.setProperty('--ink-feather', `${INK_HANDOFF / INK_ROW_DELAY * 100}%`);
    transfer.current.ink = reducedMotion || progress >= 1 ? null : sampleInkTargets(storyRef.current);
    let resizeFrame;
    const resize = () => {
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        aim();
        if (!reducedMotion && transfer.current.progress < 1) {
          transfer.current.ink = sampleInkTargets(storyRef.current);
        }
      });
    };
    window.addEventListener('resize', resize);
    const scroller = scrollRef.current;
    const story = storyRef.current;
    const transferState = transfer.current;
    scroller.addEventListener('scroll', aim, { passive: true });
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(resizeFrame);
      scroller.removeEventListener('scroll', aim);
      if (transferState.overlay === scroller) transferState.overlay = null;
      if (transferState.story === story) {
        transferState.story = null;
        transferState.contentBounds = null;
      }
    };
  }, [chapter, transfer]);

  useEffect(() => {
    if (ready) headingRef.current?.focus({ preventScroll: true });
  }, [ready]);

  const selectChapter = (index) => {
    if (section === 0 && index !== chapter) scrollRef.current.scrollTop = 0;
    setChapter(index);
    onInteract(index);
  };

  useEffect(() => {
    if (!ready) return;
    const onKey = (event) => {
      if (event.key === 'Escape') onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ready, onBack]);

  return createPortal(
    <main ref={scrollRef} className={`entity-experience entity-experience--${(data.slug || data.label).toLowerCase()} ${phase === 'toRect' || phase === 'toLava' || ready ? 'is-revealing' : ''}`}
      style={{ opacity, pointerEvents: ready ? 'auto' : 'none' }} inert={!ready} data-fluid-settled={ready ? 'true' : 'false'}
      aria-label={`${data.label} section`}>
      <header className="entity-header">
        <button className="entity-back" onClick={onBack}><span aria-hidden="true">↖</span> Menu</button>
      </header>

      <section ref={storyRef} className="entity-story">
        {section === 0 && <div className="entity-chapters" aria-label={`${data.label} chapters`}>
          {data.chapters.map((entry, index) => <button key={entry.label} onClick={() => selectChapter(index)} aria-pressed={chapter === index}>{entry.label}</button>)}
        </div>}
        {section === 0 && <div className="entity-chapter-mobile" aria-label="Project navigation">
          <button type="button" aria-label="Previous project" onClick={() => selectChapter((chapter + data.chapters.length - 1) % data.chapters.length)}>←</button>
          <span>{String(chapter + 1).padStart(2, '0')} / {String(data.chapters.length).padStart(2, '0')} <strong>{item.label}</strong></span>
          <button type="button" aria-label="Next project" onClick={() => selectChapter((chapter + 1) % data.chapters.length)}>→</button>
        </div>}
        {section === 0 && <ProjectContent key={item.label} item={item} chapter={chapter} headingRef={headingRef} />}
        {section === 1 && <SeenaProfile data={data} headingRef={headingRef} onOpenProject={onOpenProject} phase={phase} transfer={transfer} />}
        {section === 4 && <>
        <h1 ref={headingRef} tabIndex={-1}>{data.title}</h1>
        <p className="entity-intro">{data.intro}</p>
        <div className="contact-destinations">
          <a href="mailto:ssabed00@gmail.com"><span>Email</span><span aria-hidden="true">↗</span></a>
          <a href="/Seena-Abed-Resume.pdf" download><span>Résumé</span><span aria-hidden="true">↓</span></a>
          <a href="https://linkedin.com/in/seena-abed-7824b7191/" target="_blank" rel="noreferrer"><span>LinkedIn</span><span aria-hidden="true">↗</span></a>
          <a href="https://github.com/seena18" target="_blank" rel="noreferrer"><span>GitHub</span><span aria-hidden="true">↗</span></a>
        </div>
        </>}
      </section>
    </main>, document.body
  );
}
