// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { ComponentProps, DisplayComponent, EventBus, FSComponent, HEvent, Subject, VNode } from 'msfssdk';
import { debouncedTimeDelta } from '../shared/Utils';
import { ClockSimvars } from '../shared/ClockSimvarPublisher';

interface ChronoProps extends ComponentProps {
    bus: EventBus;
}

const getDisplayString = (seconds: number | null, running: boolean, ltsTest: boolean) : string => {
    if (ltsTest) {
        return '88:88';
    }

    if (seconds !== null) {
        return Math.floor(Math.min(seconds, Chrono.MAX_DISPLAYABLE_TIME_SECONDS) / Chrono.SECONDS_PER_MINUTE).toString().padStart(2, '0')
        + (running ? ':' : ' ')
        + (Math.floor(Math.min(seconds, Chrono.MAX_DISPLAYABLE_TIME_SECONDS) % Chrono.SECONDS_PER_MINUTE)).toString().padStart(2, '0');
    }
    return '';
};

export class Chrono extends DisplayComponent<ChronoProps> {
    static readonly SECONDS_PER_MINUTE = 60;

    static readonly MAX_DISPLAYABLE_TIME_SECONDS = 99 * 60 + 59; // "99:59" in seconds

    private readonly chronoText = Subject.create('');

    private readonly elapsedTime = Subject.create(null);

    private readonly running = Subject.create(false);

    private readonly ltsTest = Subject.create(false);

    private dcEssIsPowered: boolean;

    private prevTime: number;

    public onAfterRender(node: VNode): void {
        super.onAfterRender(node);

        const sub = this.props.bus.getSubscriber<ClockSimvars>();
        sub.on('ltsTest').whenChanged().handle((ltsTest) => {
            this.ltsTest.set(ltsTest === 0);
        });

        sub.on('dcHot1IsPowered').whenChanged().handle((dcHot1IsPowered) => {
            if (!dcHot1IsPowered) {
                this.running.set(false);
                this.elapsedTime.set(null);
            }
        });

        sub.on('dcEssIsPowered').whenChanged().handle((dcEssIsPowered) => this.dcEssIsPowered = dcEssIsPowered);

        sub.on('absTime').atFrequency(5).handle((absTime) => {
            if (this.running.get()) {
                const newElapsedTime = (this.elapsedTime.get() || 0) + debouncedTimeDelta(absTime, this.prevTime);
                this.elapsedTime.set(newElapsedTime);
            }
            this.prevTime = absTime;
        });

        const hEventsSub = this.props.bus.getSubscriber<HEvent>();
        hEventsSub.on('hEvent').handle((eventName) => {
            switch (eventName) {
            case 'A32NX_CHRONO_RST':
                if (this.dcEssIsPowered) {
                    if (this.running.get()) {
                        this.elapsedTime.set(0);
                    } else {
                        this.elapsedTime.set(null);
                    }
                }
                break;
            case 'A32NX_CHRONO_TOGGLE':
                if (this.dcEssIsPowered) {
                    this.running.set(!this.running.get());
                }
                break;
            default: break;
            }
        });

        this.elapsedTime.sub((elapsedTime) => SimVar.SetSimVarValue('L:A32NX_CHRONO_ELAPSED_TIME', 'number', elapsedTime ?? -1)); // Simvar ist not nullable, so a -1 placeholder is used

        [
            this.elapsedTime,
            this.running,
            this.ltsTest,
        ].forEach((attr) => attr.sub(() => this.chronoText.set(getDisplayString(this.elapsedTime.get(), this.running.get(), this.ltsTest.get()))));
    }

    public render(): VNode {
        return (
            <text x="47" y="60" class="fontBig">{this.chronoText}</text>
        );
    }
}
