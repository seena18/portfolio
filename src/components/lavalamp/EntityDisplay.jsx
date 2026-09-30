import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './EntityDisplay.css';
import './SeenaProfile.css';
import './TerminalSurface.css';
import './ContentDossier.css';
import { sampleInkTargets, INK_HANDOFF, INK_ROW_DELAY, inkRevealFront } from './inkTargets';
import MothermoldAssembly from './MothermoldAssembly';

const MeshwrightStage3D = lazy(() => import('./MeshwrightStage3D'));
const SeenaPortrait3D = lazy(() => import('./SeenaPortrait3D'));

function ProjectDiagram({ type, label }) {
  const isEnterprise = type === 'enterprise';
  const nodes = isEnterprise
    ? [['Facilities', '30+', 'Global document workflows'], ['Filing interface', 'Angular / TS', 'Capture + retrieval'], ['Services', 'FastAPI', 'Application / API layer'], ['Data', 'SQL / Redis', 'Persistence + cache'], ['Deployment', 'Azure', 'Cloud delivery']]
    : [['Field teams', '50-person pilot', 'Training + inspections'], ['Mobile client', 'React Native', 'Cross-platform workflows'], ['Services', 'Express', 'Claims-based access + MFA'], ['Data', 'PostgreSQL', 'Migrated from NoSQL'], ['Deployment', 'GCP / Docker', 'Containerized delivery']];
  return <div className="system-map" role="img" aria-label={label}>
    <div className="system-map__heading">
      <span>System architecture / {isEnterprise ? 'enterprise' : 'field operations'}</span>
      <strong>{isEnterprise ? 'Document flow' : 'Safety workflow'}</strong>
    </div>
    <div className="system-map__grid">
      <svg className="system-map__wires" viewBox="0 0 1200 420" preserveAspectRatio="none" aria-hidden="true">
        <defs><marker id={`arrow-${type}`} viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L8 4L0 8" fill="currentColor" /></marker></defs>
        <path d="M350 90H425 M775 90H850 M1000 150V210H600V270" markerEnd={`url(#arrow-${type})`} />
        <path className="system-map__deploy" d="M1080 270V150" markerEnd={`url(#arrow-${type})`} />
      </svg>
      <svg className="system-map__wires system-map__wires--mobile" viewBox="0 0 400 564" preserveAspectRatio="none" aria-hidden="true">
        <path d="M200 112V144 M200 256V288 M140 400V416H92V432" markerEnd={`url(#arrow-${type})`} />
        <path className="system-map__deploy" d="M308 432V400" markerEnd={`url(#arrow-${type})`} />
      </svg>
      {nodes.map(([name, value, note], index) => <div className={`system-map__node system-map__node--${index}`} key={name}>
        <span>{String(index + 1).padStart(2, '0')} / {name}</span><strong>{value}</strong><small>{note}</small>
      </div>)}
      <div className="system-map__legend"><span>→ Request / data</span><span>⇡ Deployment</span></div>
    </div>
    <p className="system-map__caption">Reconstructed architecture. No confidential interfaces or data.</p>
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

const caseNotes = {
  Chevron: { subtitle: 'Document platform', role: 'Owned the filing front end and release pipeline. Contributed to FastAPI services and the SQL data layer.', problem: 'Paper and legacy document workflows at global scale. A separate retention process took about 48 hours.', result: 'Supported a platform handling 1M+ documents annually across 30+ facilities. Separately, parallel PowerShell execution moved 1.2M retention records in about three hours.' },
  Meshwright: { subtitle: 'Text → image → 3D → rig → motion', role: 'Built the orchestration and 3D pipeline: generation, review gates, recovery, validation, and export.', problem: 'Generated assets need more than a convincing preview: interrupted jobs, mesh quality, rigging, and motion all need inspection.', result: 'A checkpointed workflow with persisted recovery and five export formats. The Dust Saint artifact shows the path through corrected idle and walk clips.' },
  '404Leads': { subtitle: 'Map-first lead intelligence', role: 'Built map-based discovery, verification, durable processing, and the user-isolated lead pipeline.', problem: 'Raw place data does not tell you which businesses lack a credible web presence—or whether the evidence is reliable.', result: 'A streaming workflow that deduplicates businesses, cross-checks identity and web presence, and exposes the evidence behind each lead.' },
  DaveTrader: { subtitle: 'Explainable market decisions', role: 'Built the market workspace, strategy tooling, and explainable decision-support experience.', problem: 'Signals alone omit the context needed to understand, validate, or invalidate a trading idea.', result: 'A live workspace joining market data, research, backtests, and strategy inspection with an auditable decision trail.' },
  Mynah: { subtitle: 'Local voice, line by line', role: 'Built the self-hosted voice editor and generation workflow around Chatterbox Turbo.', problem: 'One bad line should not mean regenerating an entire narration or sending voice data to a hosted editor.', result: 'Record or upload a voice, generate independent lines, reroll a take, and export narration. Fingerprinted takes keep unchanged audio reusable.' },
  Mothermold: { subtitle: 'From STL to silicone tooling', role: 'Built the mold-generation workflow and browser-based geometry inspection tools.', problem: 'Printable tooling requires verified containment, clearances, assembly, and export—not just a plausible shape.', result: 'Inspectable jackets, lids, displacement cores, lugs, and cutaways, with repair, interference checks, and print-package export.' },
};

function ProjectContent({ item, headingRef }) {
  const notes = caseNotes[item.label];
  return <article className={`case-study${item.label === 'Chevron' ? ' case-study--document-flow' : ''}`}>
    <header className="case-heading">
      <h1 ref={headingRef} tabIndex={-1}>{item.label}</h1>
      <p className="case-subtitle">{notes.subtitle}</p>
      <p className="dossier-label case-status">{item.kind} · {item.status}</p>
    </header>
    <div className="case-grid">
      <div className="case-artifacts">
        <figure className={`project-visual${item.visualStyle ? ` project-visual--${item.visualStyle}` : ''}`}>
          <ProjectMedia item={item} />
        </figure>
        {item.proofs && <div className="case-evidence" aria-label={`${item.label} evidence`}>
          {item.proofs.map((proof) => <div key={proof.label}><strong className={proof.value.length > 7 ? 'is-long' : ''}>{proof.value}</strong><span>{proof.label}</span></div>)}
        </div>}
        <section className="case-process"><h2 className="dossier-label">Implementation</h2><p>{item.body}</p></section>
      </div>
      <aside className="case-narrative">
        {[['Context', item.intro], ['Role', notes.role], ['Problem', notes.problem], ['Result', notes.result]].map(([label, copy]) => <section key={label}><h2 className="dossier-label">{label}</h2><p>{copy}</p></section>)}
        <section><h2 className="dossier-label">Stack</h2><p className="case-stack">{item.tags.join(' · ')}</p></section>
        {(item.href || item.demo) && <div className="entity-project-links">
          {item.href && <a className="entity-link" href={item.href} target="_blank" rel="noreferrer">{item.linkLabel || 'GitHub'} <span aria-hidden="true">↗</span></a>}
          {item.demo && <a className="entity-link entity-link--secondary" href={item.demo} target="_blank" rel="noreferrer">Demo <span aria-hidden="true">▶</span></a>}
        </div>}
      </aside>
    </div>
  </article>;
}

function SeenaRole({ role, onOpenProject }) {
  return <article className="profile-role">
    <div className="profile-role__identity"><span>{role.period}</span><h2>{role.organization}</h2><p>{role.title}</p></div>
    <div className="profile-role__detail"><p>{role.body}</p>
    {role.href && <a className="profile-role__link" href={role.href} target="_blank" rel="noreferrer">{role.linkLabel}<span aria-hidden="true">↗</span></a>}
    {role.project && <button type="button" className="profile-role__link" onClick={onOpenProject}>View document platform project<span aria-hidden="true">↗</span></button>}
    </div>
  </article>;
}

function SeenaProfile({ data, headingRef, onOpenProject, phase, transfer }) {
  return <div className="seena-profile profile-sheet">
    <div className="profile-sheet__hero">
      <span className="profile-index profile-index--hero">01 / Profile</span>
      <Suspense fallback={<figure className="seena-portrait" aria-label="Loading portrait" aria-busy="true" />}>
        <SeenaPortrait3D phase={phase} transfer={transfer} />
      </Suspense>
      <div className="profile-sheet__opening">
        <div className="profile-sheet__lead">
          <h1 ref={headingRef} tabIndex={-1}>{data.title}</h1>
          <p className="profile-descriptor dossier-label">Full-stack engineer /<br /> Product builder</p>
        </div>
        <p className="profile-sheet__intro">{data.intro}</p>
      </div>
      </div>
      <div className="profile-sheet__body">
        <div className="profile-sheet__roles">
          {data.experience.map((experience) => <SeenaRole key={experience.organization} role={experience} onOpenProject={onOpenProject} />)}
        </div>
      </div>
        <div className="profile-sheet__facts">
          <div className="profile-capabilities">
            <section><h2>Product</h2><ul className="profile-capability-list"><li>React</li><li>TypeScript</li><li>React Native</li><li>Angular</li><li>Next.js</li></ul></section>
            <section><h2>Backend</h2><ul className="profile-capability-list"><li>Python</li><li>FastAPI</li><li>Express</li><li>PostgreSQL</li><li>Supabase</li><li>Authentication & RBAC</li></ul></section>
            <section className="profile-education"><h2>Education</h2><p><strong>{data.education.degree}</strong><br />{data.education.school}<br />{data.education.gpa}</p></section>
            <section><h2>Systems</h2><ul className="profile-capability-list"><li>Docker</li><li>Azure</li><li>GCP</li><li>CI/CD</li><li>Durable workers</li></ul></section>
            <section><h2>Applied AI</h2><ul className="profile-capability-list"><li>LangGraph</li><li>GPU serving</li><li>3D workflows</li><li>Evidence-based evaluation</li></ul></section>
          </div>
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
    education: { degree: 'B.S. Computer Science with Honors', school: 'Cal Poly San Luis Obispo', gpa: '3.9 GPA' },
  },
  4: {
    label: 'Contact', eyebrow: '', title: 'Contact',
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
    <main ref={scrollRef} className={`entity-experience terminal-surface entity-experience--${(data.slug || data.label).toLowerCase()} ${phase === 'toRect' || phase === 'toLava' || ready ? 'is-revealing' : ''}`}
      style={{ opacity, pointerEvents: ready ? 'auto' : 'none' }} inert={!ready} data-fluid-settled={ready ? 'true' : 'false'}
      aria-label={`${data.label} section`}>
      <header className="entity-header">
        <button className="entity-back" onClick={onBack}><span aria-hidden="true">↖</span> Menu</button>
        <span className="terminal-location"><span aria-hidden="true">/</span> {data.label}</span>
      </header>

      <section ref={storyRef} className="entity-story">
        {section === 0 && <div className="entity-chapters" aria-label={`${data.label} chapters`}>
          {data.chapters.map((entry, index) => <button key={entry.label} onClick={() => selectChapter(index)} aria-pressed={chapter === index}>{entry.label}</button>)}
        </div>}
        {section === 0 && <div className="entity-chapter-mobile" aria-label="Project navigation">
          <button type="button" aria-label="Previous project" onClick={() => selectChapter((chapter + data.chapters.length - 1) % data.chapters.length)}>←</button>
          <span><strong>{item.label}</strong></span>
          <button type="button" aria-label="Next project" onClick={() => selectChapter((chapter + 1) % data.chapters.length)}>→</button>
        </div>}
        {section === 0 && <ProjectContent key={item.label} item={item} headingRef={headingRef} />}
        {section === 1 && <SeenaProfile data={data} headingRef={headingRef} onOpenProject={onOpenProject} phase={phase} transfer={transfer} />}
        {section === 4 && <>
        <div className="contact-opening"><h1 ref={headingRef} tabIndex={-1}>Let’s talk.</h1>
        <p className="contact-invitation">Have something interesting to build?</p></div>
        <div className="contact-destinations">
          <a href="mailto:ssabed00@gmail.com"><span>Email</span><span aria-hidden="true">↗</span></a>
          <a href="/Seena-Abed-Resume.pdf" download><span>Résumé</span><span aria-hidden="true">↓</span></a>
          <a href="https://linkedin.com/in/seena-abed-7824b7191/" target="_blank" rel="noreferrer"><span>LinkedIn</span><span aria-hidden="true">↗</span></a>
          <a href="https://github.com/seena18" target="_blank" rel="noreferrer"><span>GitHub</span><span aria-hidden="true">↗</span></a>
        </div>
        <dl className="contact-metadata">
          <div><dt>Base</dt><dd>Sacramento / Folsom, CA</dd></div>
          <div><dt>Work</dt><dd>Remote / hybrid</dd></div>
          <div><dt>Focus</dt><dd>Product · full stack · forward deployed · applied AI</dd></div>
        </dl>
        </>}
      </section>
    </main>, document.body
  );
}
