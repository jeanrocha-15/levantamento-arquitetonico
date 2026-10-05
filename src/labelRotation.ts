// Text axes are bidirectional: flip by 180° when needed for legibility.
export function readableRotation(degrees:number) {let angle=((degrees%360)+360)%360;if(angle>180)angle-=360;if(angle>90)angle-=180;if(angle< -90)angle+=180;return angle}
export function lineRotation(a:{x:number;y:number},b:{x:number;y:number}) {return readableRotation(Math.atan2(b.y-a.y,b.x-a.x)*180/Math.PI)}
