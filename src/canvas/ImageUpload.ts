import paper from 'paper';

export interface ImageUploadState {
  raster?: paper.Raster;
  imageUrl?: string;
  calibrationPoints: paper.Point[];
  scale: number;
}

export class ImageUpload {
  state: ImageUploadState = {
    calibrationPoints: [],
    scale: 1,
  };

  constructor() {}

  loadImage(imageUrl: string) {
    if (this.state.raster) {
      this.state.raster.remove();
    }
    const raster = new paper.Raster({ source: imageUrl, position: paper.view.center });
    raster.sendToBack();
    this.state.raster = raster;
    this.state.imageUrl = imageUrl;
  }

  setVisible(visible: boolean) {
    if (this.state.raster) {
      this.state.raster.visible = visible;
    }
  }

  removeImage() {
    if (this.state.raster) {
      this.state.raster.remove();
      this.state.raster = undefined;
      this.state.imageUrl = undefined;
    }
    this.state.calibrationPoints = [];
    this.state.scale = 1;
  }

  setCalibrationPoint(point: paper.Point) {
    if (this.state.calibrationPoints.length < 2) {
      this.state.calibrationPoints.push(point);
    } else {
      this.state.calibrationPoints = [point];
    }
  }

  calibrate(realWorldDistance: number) {
    if (this.state.calibrationPoints.length !== 2) return;
    const [p1, p2] = this.state.calibrationPoints;
    const pixelDist = p1.getDistance(p2);
    if (pixelDist === 0) return;
    const factor = realWorldDistance / pixelDist;
    this.state.scale = factor;
    if (this.state.raster) {
      const pivot = p1.add(p2).divide(2);
      this.state.raster.scale(factor, pivot);
    }
  }
}
