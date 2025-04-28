import React from 'react';
import { Routes, Route } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import Navigation from './components/Navigation';
import Home from './pages/Home';
import About from './pages/About';
import Projects from './pages/Projects';
import Contact from './pages/Contact';
import LavaLampScene from './components/lavalamp/scene';
import './styles/global.css';

const App = () => {
  return (
    <div className="app-container">
      <LavaLampScene />
      {/* <div className="content-overlay"> */}
        {/* <Header />
        <Navigation />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/projects" element={<Projects />} />
          <Route path="/contact" element={<Contact />} />
        </Routes>
        <Footer /> */}
      {/* </div> */}
    </div>
  );
};

export default App;