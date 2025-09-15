import React from 'react';
import MorphingLavaLampScene from '../components/lavalamp/MorphingLavaLamp';

const Home = () => {
  // Define your portfolio items that will become blobs
  const portfolioItems = [
    {
      content: (
        <div className="portfolio-card">
          <h3>🚀 Web Development</h3>
          <p>Full-stack applications with modern frameworks</p>
          <div className="tech-stack">
            <span className="tech-tag" style={{'--i': 0}}>React</span>
            <span className="tech-tag" style={{'--i': 1}}>Node.js</span>
            <span className="tech-tag" style={{'--i': 2}}>Three.js</span>
          </div>
        </div>
      )
    },
    {
      content: (
        <div className="portfolio-card">
          <h3>🎨 UI/UX Design</h3>
          <p>Creating beautiful, intuitive user experiences</p>
          <div className="tech-stack">
            <span className="tech-tag" style={{'--i': 0}}>Figma</span>
            <span className="tech-tag" style={{'--i': 1}}>CSS</span>
            <span className="tech-tag" style={{'--i': 2}}>Animation</span>
          </div>
        </div>
      )
    },
    {
      content: (
        <div className="portfolio-card">
          <h3>🤖 Machine Learning</h3>
          <p>AI-powered solutions and data analysis</p>
          <div className="tech-stack">
            <span className="tech-tag" style={{'--i': 0}}>Python</span>
            <span className="tech-tag" style={{'--i': 1}}>TensorFlow</span>
            <span className="tech-tag" style={{'--i': 2}}>OpenAI</span>
          </div>
        </div>
      )
    },
    {
      content: (
        <div className="portfolio-card">
          <h3>📱 Mobile Apps</h3>
          <p>Cross-platform mobile development</p>
          <div className="tech-stack">
            <span className="tech-tag" style={{'--i': 0}}>React Native</span>
            <span className="tech-tag" style={{'--i': 1}}>Flutter</span>
          </div>
        </div>
      )
    }
  ];

  return (
    <div className="home-page">
      <MorphingLavaLampScene portfolioItems={portfolioItems} />
    </div>
  );
};

export default Home;