import app from '../server';

export default function handler(req: any, res: any) {
  // Pass through to Express application
  return app(req, res);
}
