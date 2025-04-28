export const loadModel = (url, onLoad) => {
    const loader = new THREE.GLTFLoader();
    loader.load(url, (gltf) => {
        onLoad(gltf.scene);
    }, undefined, (error) => {
        console.error('An error occurred while loading the model:', error);
    });
};

export const createScene = () => {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee);
    return scene;
};

export const createCamera = (width, height) => {
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
    camera.position.set(0, 1, 5);
    return camera;
};

export const createRenderer = (width, height) => {
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    return renderer;
};

export const addLight = (scene) => {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);
};