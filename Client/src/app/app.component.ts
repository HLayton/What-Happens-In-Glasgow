import {ChangeDetectorRef, Component, OnInit, ViewChild, ViewEncapsulation} from '@angular/core';
import {HomeComponent} from './home/home.component';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css',
  '../assets/css/sticky-footer.css'],
  encapsulation: ViewEncapsulation.None
})
export class AppComponent implements OnInit {

  @ViewChild(HomeComponent) home;

  public endDate: Date;
  public period: number;
  public minDate = new Date(2017, 11, 1);
  public maxDate = new Date();

  constructor(private _changeDetectorRef: ChangeDetectorRef) {  }

  ngOnInit() {
    this.endDate = new Date();
    this.period = 3;
  }

  public submitDate(): void {
    this.home.refreshData();
  }

  public resetDate(): void {
    this.ngOnInit();
    this._changeDetectorRef.detectChanges();
    this.submitDate();
  }

  public hideIntroBox(): void {
    document.getElementById('intro-box').style.display = 'none';
  }
}
