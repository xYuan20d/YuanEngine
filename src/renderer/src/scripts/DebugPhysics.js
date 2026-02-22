export default class DebugPhysics extends Behaviour {
  
  static schema = {
    active: {
      type: PropType.Boolean,
      default: true,
      label: 'Active'
    }
  }

  onStart() {
    console.log(`[DebugPhysics] Inspecting: ${this.gameObject.name}`);
    
    // 1. Check RigidBody
    const rb = this.gameObject.userData.physicsBody;
    if (!rb) {
      console.error(`[DebugPhysics] ❌ No RigidBody found on ${this.gameObject.name}!`);
      return;
    }

    console.log(`[DebugPhysics] ✅ RigidBody detected. Handle: ${rb.handle}`);

    // 2. Check Mass
    const mass = rb.mass();
    console.log(`[DebugPhysics] ⚖️ Actual Mass in Physics Engine: ${mass.toFixed(4)}`);
    
    // 3. Check Colliders
    const numColliders = rb.numColliders();
    console.log(`[DebugPhysics] 📦 Number of Colliders: ${numColliders}`);

    if (numColliders > 0) {
      for (let i = 0; i < numColliders; i++) {
        const collider = rb.collider(i);
        // Rapier shape types are integers or objects depending on version/bindings, usually we check shape object
        // But printing the shape object is safest
        const shape = collider.shape; 
        console.log(`[DebugPhysics]    Collider ${i}:`);
        console.log(`       - Shape Object:`, shape);
        console.log(`       - Type: ${shape.type} (Cube=0, Sphere=1, Capsule=2...)`); 
        console.log(`       - Sensor: ${collider.isSensor()}`);
        console.log(`       - Friction: ${collider.friction()}`);
        console.log(`       - Restitution: ${collider.restitution()}`);
      }
    } else {
      console.warn(`[DebugPhysics] ⚠️ RigidBody has NO colliders!`);
    }
  }

  onUpdate(dt) {
    // Optional: Log Y position to see falling
    // if (this.gameObject.userData.physicsBody) {
    //    console.log(this.gameObject.position.y);
    // }
  }
}