import React, { useEffect } from 'react';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { useThree } from '@react-three/fiber';

const Controls = () => {
    const { camera, gl } = useThree();

    useEffect(() => {
        const controls = new OrbitControls(camera, gl.domElement);
        controls.enableDamping = true; // an animation loop is required when either damping or auto-rotation are enabled
        controls.dampingFactor = 0.25;
        controls.screenSpacePanning = false;
        controls.maxPolarAngle = Math.PI / 2;

        return () => {
            controls.dispose();
        };
    }, [camera, gl]);

    return null;
};

export default Controls;